/**
 * 随机延时函数
 * @param minDelay 最小延时（毫秒）
 * @param maxDelay 最大延时（毫秒）
 */
export async function randomDelay(minDelay: number, maxDelay: number): Promise<void> {
    // 计算随机延时时间
    const delay = minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1));
    // 等待随机时间
    await new Promise(resolve => setTimeout(resolve, delay));
}