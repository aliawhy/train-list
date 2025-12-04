// 用户轨迹生成器

import {AnalyzedQueryData, UserTrajectory} from '../report-generation-types';

export function getUserTrajectories(data: AnalyzedQueryData[]): UserTrajectory {
    const trajectories: UserTrajectory = {};
    data.forEach(item => {
        if (!trajectories[item.userUuid]) trajectories[item.userUuid] = [];
        trajectories[item.userUuid].push(item);
    });
    for (const userUuid in trajectories) {
        trajectories[userUuid].sort((a, b) => a.eventTimestamp - b.eventTimestamp);
    }
    return trajectories;
}
