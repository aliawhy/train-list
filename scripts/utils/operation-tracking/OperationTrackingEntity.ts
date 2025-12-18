/**
 * ╔════════════════════════════════════════════════════════════╗
 * ║                        基础字段区                            ║
 * ╚════════════════════════════════════════════════════════════╝
 */

interface QueryData {
    // 这里无需定义，由运行态场景写什么就是什么
}

// 映射类型，将每个事件类型映射到其对应的载荷类型
export interface EventPayloadMap {
    [EventType.QUERY]: QueryEventPayload;
    // 未来按需扩展
}

export enum EventType {
    QUERY = 'query',   // 查询行为
    // 其他 例如 切换车站、 数据上报、 查看换乘指示等，这些未来再处理，目前仅预留，但不知道要埋点什么。
    // STATION_SWITCH = 'station_switch',
}

// 使用泛型来定义 OperationTrackingParams
export interface OperationTrackingParams<T extends EventType> {
    // 基础信息
    userUuid: string;
    eventTimestamp: number;
    eventType: T;

    // 数据内容：事件载荷， 并通过类型映射，指定数据荷载的字段类型
    payload: EventPayloadMap[T];
}


/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║                      具体数据载荷区                          ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

// 0，所有载荷必须继承 BaseEventPayload
// 1，在这里定义新的上报数据载荷
// 2，定义后，补充基础字段区的 EventPayloadMap、EventType

export interface BaseEventPayload {
    // 所有事件载荷的公共字段可以放在这里
    // 例如： commonField: string;
}

// 查询行为记录
export type QueryModuleType = '广东城际' | '广东铁路' | '定制中转' | '拼接中转'

export interface QueryEventPayload extends BaseEventPayload {
    queryModule: QueryModuleType;
    queryData: QueryData;
}

/**
 * ╔════════════════════════════════════════════════════════════╗
 * ║                        使用示例区                            ║
 * ╚════════════════════════════════════════════════════════════╝
 */

// 创建一个查询事件，类型完全匹配
// const queryEvent: OperationTrackingParams<EventType.QUERY> = {
//     userUuid: 'user-123',
//     eventTimestamp: Date.now(),
//     eventType: EventType.QUERY,
//     payload: {
//         queryModule: '广东城际',
//         departure: {} as QueryData, // 假设这是你的 QueryData
//     }
// };

// 如果尝试错误地组合类型，TypeScript 会立即报错！
// const invalidEvent: OperationTrackingParams<EventType.QUERY> = {
//     userUuid: 'user-123',
//     eventTimestamp: Date.now(),
//     eventType: EventType.QUERY,
//     payload: {
//         // payload 中缺少 queryModule 和 departure，TS会报错
//     }
// };
