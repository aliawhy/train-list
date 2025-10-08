export interface Line {
    name: string;
    color: string;
    stations: string[]; // 车站名列表（有序）
    stationPairAdditions: Record<string, string[]>; // 车站队需要补充的车站节点，例如出现麻涌-洪梅 这个组合， 就要加入 东莞西
}
