// 常用出生城市及经度（东经为正）。经度用来计算"真太阳时"（八字排盘更准确）。
// 找不到的城市，在设置页选"其他"，手动填经度即可。

export interface City {
  name: string;
  longitude: number;
}

export const CITIES: City[] = [
  { name: '曼谷', longitude: 100.5 },
  { name: '清迈', longitude: 98.99 },
  { name: '普吉', longitude: 98.39 },
  { name: '芭堤雅', longitude: 100.88 },
  { name: '北京', longitude: 116.41 },
  { name: '上海', longitude: 121.47 },
  { name: '广州', longitude: 113.26 },
  { name: '深圳', longitude: 114.06 },
  { name: '成都', longitude: 104.07 },
  { name: '重庆', longitude: 106.55 },
  { name: '杭州', longitude: 120.15 },
  { name: '南京', longitude: 118.8 },
  { name: '武汉', longitude: 114.3 },
  { name: '西安', longitude: 108.94 },
  { name: '天津', longitude: 117.2 },
  { name: '长沙', longitude: 112.94 },
  { name: '郑州', longitude: 113.63 },
  { name: '济南', longitude: 117.0 },
  { name: '青岛', longitude: 120.38 },
  { name: '沈阳', longitude: 123.43 },
  { name: '哈尔滨', longitude: 126.64 },
  { name: '福州', longitude: 119.3 },
  { name: '厦门', longitude: 118.09 },
  { name: '昆明', longitude: 102.83 },
  { name: '香港', longitude: 114.17 },
  { name: '台北', longitude: 121.56 },
  { name: '新加坡', longitude: 103.82 },
  { name: '吉隆坡', longitude: 101.69 },
];

export const OTHER_CITY = '其他';
