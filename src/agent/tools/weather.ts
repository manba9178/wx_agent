import { config } from '../../config.js';
import type { Tool } from './types.js';

/** WMO 天气代码 -> 中文描述 */
const WMO_CODE: Record<number, string> = {
  0: '晴',
  1: '晴间多云',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  56: '冻毛毛雨',
  57: '强冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '强冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '阵雨',
  81: '强阵雨',
  82: '暴雨',
  85: '阵雪',
  86: '强阵雪',
  95: '雷阵雨',
  96: '雷阵雨伴小冰雹',
  99: '雷阵雨伴大冰雹',
};

/**
 * 天气工具：Open-Meteo（免费、无需 API Key）
 * 先用 geocoding 拿到经纬度，再拉实时 + 未来三天预报。
 */
export const weatherTool: Tool = {
  name: 'get_weather',
  description:
    '查询某个城市当前的实时天气以及未来三天天气预报。' +
    '当用户问「今天天气怎么样」「明天会不会下雨」「北京多少度」这类问题时必须调用本工具。',
  parameters: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: `城市名称，例如「北京」「上海」「深圳」「杭州」。用户没说城市时默认使用「${config.defaults.city}」。`,
      },
    },
    required: ['city'],
  },

  async run(args) {
    const city = String(args.city ?? config.defaults.city).trim();

    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city,
    )}&count=1&language=zh&format=json`;
    const geo = (await (await fetch(geoUrl)).json()) as {
      results?: Array<{
        name: string;
        latitude: number;
        longitude: number;
        admin1?: string;
        country?: string;
      }>;
    };

    const place = geo.results?.[0];
    if (!place) {
      return `没有找到城市「${city}」，请换一个更完整的城市名（例如「浙江杭州」）。`;
    }

    const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
    forecastUrl.searchParams.set('latitude', String(place.latitude));
    forecastUrl.searchParams.set('longitude', String(place.longitude));
    forecastUrl.searchParams.set(
      'current',
      'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
    );
    forecastUrl.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
    forecastUrl.searchParams.set('timezone', 'auto');
    forecastUrl.searchParams.set('forecast_days', '3');

    const data = (await (await fetch(forecastUrl)).json()) as {
      current: Record<string, number>;
      daily: Record<string, Array<number | string>>;
    };

    const cur = data.current;
    const lines: string[] = [
      `【${place.name}${place.admin1 ? `·${place.admin1}` : ''} 天气】`,
      `当前：${WMO_CODE[cur.weather_code] ?? '未知'}，${cur.temperature_2m}°C（体感 ${cur.apparent_temperature}°C），` +
        `湿度 ${cur.relative_humidity_2m}%，风速 ${cur.wind_speed_10m} km/h`,
      '未来三天：',
    ];

    (data.daily.time as string[]).forEach((day, index) => {
      const code = data.daily.weather_code[index] as number;
      const min = data.daily.temperature_2m_min[index];
      const max = data.daily.temperature_2m_max[index];
      const rain = data.daily.precipitation_probability_max[index];
      lines.push(
        `  ${day}：${WMO_CODE[code] ?? '未知'} ${min}~${max}°C，降水概率 ${rain ?? '-'}%`,
      );
    });

    return lines.join('\n');
  },
};
