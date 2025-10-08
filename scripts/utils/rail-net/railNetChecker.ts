import {prodLines} from "./line";

// 1. 使用 flatMap 将所有 stations 数组合并成一个大的、扁平的数组
// 2. 使用 new Set() 构造函数，它会自动接收一个可迭代对象（如数组）并创建一个唯一的集合
export const allStationsSet: Set<string> = new Set(prodLines.flatMap(line => line.stations));
