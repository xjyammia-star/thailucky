// lunar-javascript 没有自带类型声明，这里只声明用到的部分
declare module 'lunar-javascript' {
  export class EightChar {
    setSect(sect: number): void;
    getYear(): string;
    getMonth(): string;
    getDay(): string;
    getTime(): string;
    getDayGan(): string;
  }
  export class Lunar {
    getEightChar(): EightChar;
  }
  export class Solar {
    static fromYmdHms(y: number, m: number, d: number, h: number, mi: number, s: number): Solar;
    getLunar(): Lunar;
  }
}
