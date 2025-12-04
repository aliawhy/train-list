import * as fs from 'fs';
import * as path from 'path';
import {AnalyzedQueryData} from '../report-generation-types';
import {QueryData, StationExtension} from '../journey-query-filter-types';
import {StationOption} from "../../fetch/StationUtils";
import {EventType, OperationTrackingParams} from "../../operation-tracking/OperationTrackingEntity";

export function readAndParseJson(filePath: string): OperationTrackingParams<EventType>[] {
    const absolutePath = path.resolve(filePath);
    const fileContent = fs.readFileSync(absolutePath, 'utf-8');
    const jsonArray = JSON.parse(fileContent) as OperationTrackingParams<EventType>[];
    if (!Array.isArray(jsonArray)) {
        throw new Error("文件内容不是一个有效的 JSON 数组。");
    }
    return jsonArray;
}

export function transformData(rawData: OperationTrackingParams<EventType>[]): AnalyzedQueryData[] {
    return rawData
        .filter(event => event.eventType === EventType.QUERY && event.payload)
        .map(event => {
            const payload = event.payload as any;
            const queryData = payload.queryData as QueryData;

            const getStationName = (station: StationOption | StationExtension | string | null | undefined): string => {
                // if (typeof station === 'string' && station) return station;
                // if (station && typeof station === 'object' && station.name) return station.name;
                // return '未知车站';
                if (!station) {
                    return '未知车站';
                }

                // 1. 处理新数据: StationExtension (广东城际)
                if (typeof station === 'object' && 'displayName' in station) {
                    return station.displayName || '未知车站';
                }

                // 2. 处理旧数据: StationOption (或其他有 name 属性的对象)
                if (typeof station === 'object' && station.name) {
                    return station.name;
                }

                // 3. 处理新数据: string
                if (typeof station === 'string' && station) {
                    return station;
                }

                return '未知车站';
            };

            const isGDCJFamiliarMode = queryData?.isGDCJFamiliarMode ?? false;
            const simpleStationMinTransferTimeForGDCJ = queryData?.simpleStationMinTransferTimeForGDCJ ?? null;
            const complexStationMinTransferTimeForGDC = queryData?.complexStationMinTransferTimeForGDC ?? null;

            return {
                userUuid: event.userUuid,
                eventTimestamp: event.eventTimestamp,
                queryModule: payload.queryModule,
                departureStation: getStationName(queryData.departureStation),
                arrivalStation: getStationName(queryData.arrivalStation),
                departureDay: queryData.departureDay || '未知日期',
                rawPayload: payload,
                isGDCJFamiliarMode,
                simpleStationMinTransferTimeForGDCJ,
                complexStationMinTransferTimeForGDC,
            };
        });
}
