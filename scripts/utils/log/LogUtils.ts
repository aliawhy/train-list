// 全局计时统计系统
interface FunctionTimeLogInfo {
    callCount: number;      // 调用次数
    totalTime: number;      // 总耗时（毫秒）
    startTime?: number;     // 当前调用开始时间（临时存储）
}

// 全局变量
const timeCounterLog: Record<string, FunctionTimeLogInfo> = {};

// 中间变量存储
const functionStartTimes: Record<string, number> = {};

// 清空计时统计
export function clearTimeCounterLog(): void {
    Object.keys(timeCounterLog).forEach(key => {
        delete timeCounterLog[key];
    });
    Object.keys(functionStartTimes).forEach(key => {
        delete functionStartTimes[key];
    });
}

export function printTimeCounterLog(): void {
    console.debug('===== 函数调用耗时统计 =====');

    if (Object.keys(timeCounterLog).length === 0) {
        console.debug('暂无函数调用统计信息');
        return;
    }

    Object.keys(timeCounterLog).forEach(functionName => {
        const log = timeCounterLog[functionName];
        const avgTime = log.callCount > 0 ? log.totalTime / log.callCount : 0;

        console.debug(`函数名: ${functionName}`);
        console.debug(`  调用次数: ${log.callCount}`);
        console.debug(`  总耗时: ${log.totalTime.toFixed(2)}ms`);
        console.debug(`  平均耗时: ${avgTime.toFixed(2)}ms`);
        console.debug('------------------------');
    });

    console.debug('===== 统计结束 =====');
}

// 设置函数开始计时
export function setFunctionStart(functionName: string): void {
    functionStartTimes[functionName] = performance.now();

    // 初始化统计信息（如果不存在）
    if (!timeCounterLog[functionName]) {
        timeCounterLog[functionName] = {
            callCount: 0,
            totalTime: 0
        };
    }
}

// 设置函数结束计时
export function setFunctionEnd(functionName: string): void {
    const endTime = performance.now();
    const startTime = functionStartTimes[functionName];

    if (startTime !== undefined) {
        const duration = endTime - startTime;

        // 更新统计信息
        if (timeCounterLog[functionName]) {
            timeCounterLog[functionName].callCount += 1;
            timeCounterLog[functionName].totalTime += duration;
        }

        // 清除本次开始时间
        delete functionStartTimes[functionName];
    }
}

/**
 * 获取日志时间
 */
export function logTime() {
    const now = new Date();
    // 北京时间是UTC+8，所以加上8小时的毫秒数
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return `[${beijingTime.getHours()}:${beijingTime.getMinutes()}:${beijingTime.getSeconds()}.${beijingTime.getMilliseconds()}]`;
}