import {logTime} from "../log/LogUtils";
import path from "path";
import fs from "fs";
import {TrainDelayParams} from "../../processTrainDelayReport";

export function getDate(date, AddDayCount = 0) {
    if (!date) {
        date = new Date()
    }
    if (typeof date !== 'object') {
        date = date.replace(/-/g, '/')
    }
    const dd = new Date(date)

    dd.setDate(dd.getDate() + AddDayCount) // 获取AddDayCount天后的日期

    const y = dd.getFullYear()
    const m = dd.getMonth() + 1 < 10 ? '0' + (dd.getMonth() + 1) : dd.getMonth() + 1 // 获取当前月份的日期，不足10补0
    const d = dd.getDate() < 10 ? '0' + dd.getDate() : dd.getDate() // 获取当前几号，不足10补0
    return {
        fullDate: y + '-' + m + '-' + d,
        year: y,
        month: m,
        date: d,
        day: dd.getDay()
    }
}


export function clockToMinutes(clock) {
    // clock时间是  xx:xx 格式，计算时，统一转分钟来计算，以每天0点0分为基准，单位分来计算
    const timeSplit = clock.split(":");
    return parseInt(timeSplit[0]) * 60 + parseInt(timeSplit[1])
}

export function costZHToMinute(costZH) {
    let minute = 0
    if (costZH.indexOf("时") >= 0) {
        const hour = parseInt(costZH.substring(0, 2))
        const min = parseInt(costZH.substring(3, 5))
        minute += hour * 60 + min
    } else {
        const min = parseInt(costZH.substring(0, 2))
        minute += min
    }
    return minute
}

export function minutesToCostZH(minutes) {
    // 耗时中文是  04时30分 格式，分钟 -> 中文耗时
    const hour = Math.floor(minutes / 60)
    const min = minutes % 60

    if (hour > 0) {
        return hour.toString().padStart(2, '0') + '时' + min.toString().padStart(2, '0') + '分'
    } else {
        return min.toString().padStart(2, '0') + '分'
    }
}

/**
 * 获取北京时区的日期字符串
 * @param diff 天数差值，正数表示未来，负数表示过去
 * @param baseBeiJingDateStr 基准日期字符串（YYYY-MM-DD或YYYYMMDD格式），不传则使用今天的北京日期
 * @returns 北京时区的日期字符串（YYYY-MM-DD格式）
 */
export const getBeiJingDateStr = (diff?: number, baseBeiJingDateStr?: string): string => {
    if (diff === undefined || diff === null) {
        diff = 0
    }

    // 获取北京时区的当前日期
    const getBeijingDate = (): Date => {
        const now = new Date();
        // 北京时区是UTC+8
        const beijingOffset = 8 * 60;
        const localOffset = now.getTimezoneOffset();
        const totalOffset = beijingOffset + localOffset;
        return new Date(now.getTime() + totalOffset * 60 * 1000);
    };

    // 格式化日期为 YYYY-MM-DD
    const formatDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // 处理基准日期
    let baseDate: Date;
    if (baseBeiJingDateStr) {
        // 移除所有连字符，统一处理
        const cleanDateStr = baseBeiJingDateStr.replace(/-/g, '');
        // 解析日期字符串
        const year = parseInt(cleanDateStr.substring(0, 4), 10);
        const month = parseInt(cleanDateStr.substring(4, 6), 10) - 1; // 月份从0开始
        const day = parseInt(cleanDateStr.substring(6, 8), 10);
        baseDate = new Date(year, month, day);
    } else {
        baseDate = getBeijingDate();
    }

    // 应用天数差值
    const resultDate = new Date(baseDate);
    resultDate.setDate(resultDate.getDate() + diff);

    // 返回格式化的日期字符串
    return formatDate(resultDate);
};

/**
 * 将日期字符串转换为星期号
 * @param dateString 格式为 "YYYY-MM-DD" 的日期字符串
 * @returns 返回星期号（1-7，1表示星期一，7表示星期日）
 */
export function getDayOfWeek(dateString: string): number {
    const date = new Date(dateString);
    const day = date.getDay(); // getDay() 返回 0-6，0 表示星期日

    // 转换为 1-7 的格式，其中 1 表示星期一，7 表示星期日
    return day === 0 ? 7 : day;
}

/**
 * 获取从基准日期开始（不含基准天，必须大于基准天）的下一个指定星期几的北京时区日期字符串
 * @param weekX 星期几（1-7，1表示星期一，7表示星期日）
 * @param baseBeiJingDateStr 基准日期字符串（YYYY-MM-DD或YYYYMMDD格式），不传则使用今天的北京日期
 * @returns 北京时区的日期字符串（YYYY-MM-DD格式）
 */
export const getNextWeekdayBeijingDateStr = (weekX: number, baseBeiJingDateStr?: string): string => {
    // 验证weekX参数
    if (weekX < 1 || weekX > 7) {
        throw new Error('weekX must be between 1 and 7');
    }

    // 获取基准日期（北京时区）
    const baseDateStr = getBeiJingDateStr(0, baseBeiJingDateStr);
    const baseDateObj = new Date(baseDateStr);

    // 获取基准日期是星期几（0是星期日，1是星期一，...，6是星期六）
    // 转换为我们的格式：1是星期一，7是星期日
    let baseWeekday = baseDateObj.getDay();
    baseWeekday = baseWeekday === 0 ? 7 : baseWeekday;

    // 计算需要增加的天数
    let daysDiff = (weekX - baseWeekday + 7) % 7;
    // 如果结果是0，说明是当天，我们需要加7天得到下周的同个星期号
    if (daysDiff === 0) {
        daysDiff = 7;
    }
    return getBeiJingDateStr(daysDiff, baseDateStr);
};

/**
 * 计算两个日期之间的天数差
 * @param dateStr1 第一个日期字符串，格式为YYYY-MM-DD
 * @param dateStr2 第二个日期字符串，格式为YYYY-MM-DD
 * @returns 两个日期之间的天数差（绝对值）
 */
export function getDateDiff(dateStr1: string, dateStr2: string): number {
    // 将日期字符串转换为Date对象
    const date1 = new Date(dateStr1);
    const date2 = new Date(dateStr2);

    // 计算两个日期的时间差（毫秒）
    const timeDiff = Math.abs(date2.getTime() - date1.getTime());

    // 将毫秒转换为天数
    const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

    return dayDiff;
}

/**
 * 根据日期和时间计算时间戳（北京时间）
 * @param {string} trainDay - 日期，格式 "YYYY-MM-DD"，例如 "2022-02-01"。
 * @param {string} trainTime - 时间，格式 "HH:mm"，例如 "08:20"。
 * @returns {number} 时间戳
 */
export function getBeijingTimestamp(trainDay: string, trainTime: string): number {
    // 将日期和时间拼接成 ISO 8601 格式的字符串
    const dateTimeStr = `${trainDay}T${trainTime}:00+08:00`; // 添加北京时间时区偏移
    const dateObj = new Date(dateTimeStr);

    // 检查日期是否有效
    if (isNaN(dateObj.getTime())) {
        console.error(`Invalid date or time format: ${trainDay} or ${trainTime}`);
        return 0; // 返回0表示无效时间戳
    }

    return dateObj.getTime();
}

/**
 * 获取北京时区的日期时间字符串
 * @returns 北京时区的日期时间字符串（YYYYMMDDHHmmss格式）
 */
export const getBeijingDateTime = (): string => {
    // 获取北京时区的当前日期时间
    const getBeijingDateTime = (): Date => {
        const now = new Date();
        // 北京时区是UTC+8
        const beijingOffset = 8 * 60;
        const localOffset = now.getTimezoneOffset();
        const totalOffset = beijingOffset + localOffset;
        return new Date(now.getTime() + totalOffset * 60 * 1000);
    };

    // 格式化日期时间为 YYYYMMDDHHmmss
    const formatDateTime = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}${month}${day}${hours}${minutes}${seconds}`;
    };

    // 获取北京时区的当前时间并格式化
    const beijingDateTime = getBeijingDateTime();
    return formatDateTime(beijingDateTime);
};


/**
 * 将时间戳转换为北京时间字符串
 * @param timestamp 时间戳（毫秒）
 * @param format 返回格式：'date' 返回年月日，'datetime' 返回年月日时分秒，'datetimeMs' 返回年月日时分秒毫秒
 * @returns 北京时间字符串
 */
export function getBeijingTimeString(timestamp: number, format: 'date' | 'datetime' | 'datetimeMs' = 'date'): string {
    // 将时间戳转换为UTC Date对象
    const utcDate = new Date(timestamp);

    // 转换为北京时间（UTC+8）
    const beijingOffset = 8 * 60; // 8小时的分钟数
    const beijingDate = new Date(utcDate.getTime() + beijingOffset * 60 * 1000);

    const year = beijingDate.getUTCFullYear();
    const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(beijingDate.getUTCDate()).padStart(2, '0');

    if (format === 'date') {
        return `${year}-${month}-${day}`;
    }

    const hours = String(beijingDate.getUTCHours()).padStart(2, '0');
    const minutes = String(beijingDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(beijingDate.getUTCSeconds()).padStart(2, '0');

    if (format === 'datetime') {
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    // datetimeMs 格式，包含毫秒
    const milliseconds = String(beijingDate.getUTCMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}
