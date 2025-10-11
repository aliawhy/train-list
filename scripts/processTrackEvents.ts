import path from "path";
import fs from "fs";
import {simpleGit} from 'simple-git';
import {logTime} from "./utils/log/LogUtils";
import {getBeijingTimeString} from "./utils/date/DateUtil";
import {EventType, OperationTrackingParams} from "./utils/operation-tracking/OperationTrackingEntity";
import {safeWriteToBranch} from "./utils/git/GitBranchSaveWriteUtils";

const GITHUB_MASTER_BRANCH = 'main';
const GITEE_MASTER_BRANCH = 'master';

/**
 * ╔════════════════════════════════════════════════════════════╗
 * ║                     1. 数据清洗函数                           ║
 * ╚════════════════════════════════════════════════════════════╝
 *
 * 功能：从 GitHub 上传仓库扫描、拉取并清理埋点数据分支。
 * 1. 克隆仓库。
 * 2. 筛选时间窗口内的 `track-*` 分支。
 * 3. 读取每个分支中的 JSON 文件。
 * 4. 聚合所有数据。
 * 5. 删除已处理的分支。
 */
export async function scanOperationTrackingFromUploaderRepo(): Promise<OperationTrackingParams<EventType>[]> {
    try {
        console.debug(`${logTime()} 开始处理埋点信息上报分支`);

        const tempDir = path.join(process.cwd(), 'temp-track-uploader-repo');
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, {recursive: true, force: true});
        }

        const git = simpleGit();
        await git.clone(process.env.MY_GITHUB_MINI_DATA_UPLOADER_URL, tempDir);
        console.debug(`${logTime()} GitHub 上传仓库克隆完成`);

        await git.addConfig('user.email', 'action@github.com');
        await git.addConfig('user.name', 'GitHub Action');

        const repoGit = simpleGit(tempDir);
        const branchesResult = await repoGit.branch();
        const allBranches = branchesResult.all;
        console.debug(`${logTime()} 获取到所有分支数量: ${allBranches.length}`);

        const currentTime = new Date().getTime();
        const windowStart = currentTime - 3 * 60 * 60 * 1000; // x小时前
        const windowEnd = currentTime + 3 * 60 * 60 * 1000;   // x小时后

        // 筛选出符合条件的分支
        const targetBranches = allBranches.filter(branch => {
            if (!branch.startsWith('remotes/origin/track-')) {
                return false;
            }
            const actualBranchName = branch.replace('remotes/origin/', '');
            const parts = actualBranchName.split('_');
            if (parts.length < 3) return false;

            // 分支名格式: track-${EventType}_${YYYYMMDDHHMMSS}_${timestamp}_${userUuid}
            // 我们取倒数第二个作为时间戳
            const branchTimestamp = parseInt(parts[parts.length - 2]);
            if (isNaN(branchTimestamp)) return false;

            return branchTimestamp >= windowStart && branchTimestamp <= windowEnd;
        });

        console.debug(`${logTime()} 筛选出符合条件的分支数量: ${targetBranches.length}`);

        const allReports: OperationTrackingParams<EventType>[] = [];
        const branchesToDelete: string[] = [];

        for (const branch of targetBranches) {
            const actualBranchName = branch.replace('remotes/origin/', '');
            console.debug(`${logTime()} 开始处理分支: ${actualBranchName}`);
            try {
                // 从远程分支创建并切换到本地分支
                await repoGit.checkout(['-b', actualBranchName, `origin/${actualBranchName}`]);

                // 从分支名解析 uploadType
                const uploadType = actualBranchName.split('_')[0]; // e.g., "track-query"
                const filePath = path.join(tempDir, uploadType, `${uploadType}.json`);

                if (fs.existsSync(filePath)) {
                    const fileContent = fs.readFileSync(filePath, 'utf-8');
                    const reportData = JSON.parse(fileContent) as OperationTrackingParams<EventType>;
                    // 简单校验，确保数据结构基本正确
                    if (reportData && reportData.userUuid && reportData.eventType && reportData.eventTimestamp) {
                        allReports.push(reportData);
                        branchesToDelete.push(actualBranchName);
                    } else {
                        console.warn(`${logTime()} 分支 ${actualBranchName} 数据校验失败，将删除分支`);
                        branchesToDelete.push(actualBranchName);
                    }
                } else {
                    console.warn(`${logTime()} 分支 ${actualBranchName} 文件不存在: ${filePath}`);
                    branchesToDelete.push(actualBranchName);
                }
            } catch (branchError) {
                console.error(`${logTime()} 处理分支 ${actualBranchName} 时出错:`, branchError);
            } finally {
                // 确保切换回主分支，以便删除其他分支
                await repoGit.checkout(GITHUB_MASTER_BRANCH);
            }
        }

        // 删除已处理的分支
        console.debug(`${logTime()} 开始删除已处理的分支，数量: ${branchesToDelete.length}`);
        for (const branch of branchesToDelete) {
            try {
                await repoGit.deleteLocalBranch(branch, true); // 强制删除本地分支
                await repoGit.push(['origin', '--delete', branch]); // 删除远程分支
                console.debug(`${logTime()} 已删除分支: ${branch}`);
            } catch (deleteError) {
                console.error(`${logTime()} 删除分支 ${branch} 失败:`, deleteError);
            }
        }

        // 清理临时目录
        fs.rmSync(tempDir, {recursive: true, force: true});
        console.debug(`${logTime()} 上传仓库临时目录已清理`);

        console.log(`${logTime()} 埋点信息汇总完成，共拉取 ${allReports.length} 条数据`);
        return allReports;

    } catch (error) {
        console.error(`${logTime()} 处理埋点信息上报失败:`, error);
        throw error;
    }
}


/**
 * 功能：将清洗后的埋点数据，按类型和日期追加到 Gitee 下载仓库的固定分支。
 * 1. 按 eventType 和北京日期对数据进行分组。
 * 2. 克隆 Gitee 下载仓库。
 * 3. 遍历每个分组，使用通用的 safeWriteToBranch 函数安全地追加数据。
 *    该函数会处理分支的重建、存量文件的恢复和最终的追加写入。
 */
export async function mergeTrackingDataAndPushToDownloadRepo(
    reports: OperationTrackingParams<EventType>[]
): Promise<void> {
    if (reports.length === 0) {
        console.log(`${logTime()} 没有新的埋点数据需要写入，跳过。`);
        return;
    }

    try {
        console.debug(`${logTime()} 开始写入埋点数据到下载仓库`);

        // 1. 按类型和日期分组
        const groupedReports: { [key: string]: OperationTrackingParams<EventType>[] } = {};
        for (const report of reports) {
            const dateStr = getBeijingTimeString(report.eventTimestamp, 'date'); // 'YYYY-MM-DD'
            const key = `${report.eventType}_${dateStr}`;
            if (!groupedReports[key]) {
                groupedReports[key] = [];
            }
            groupedReports[key].push(report);
        }
        console.debug(`${logTime()} 数据分组完成，共${Object.keys(groupedReports).length} 个分组`);

        const tempDir = path.join(process.cwd(), 'temp-track-downloader-repo');
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, {recursive: true, force: true});
        }

        const git = simpleGit();
        if (!process.env.GITEE_MINI_DATA_DOWNLOADER_URL) {
            throw new Error('GITEE_MINI_DATA_DOWNLOADER_URL environment variable is not set.');
        }
        await git.clone(process.env.GITEE_MINI_DATA_DOWNLOADER_URL, tempDir);
        console.debug(`${logTime()} Gitee 下载仓库克隆完成`);

        const repoGit = simpleGit(tempDir);
        await repoGit.addConfig('user.email', 'action@github.com');
        await repoGit.addConfig('user.name', 'GitHub Action');

        // 2. 遍历分组，为每个分组调用 safeWriteToBranch
        for (const [groupKey, newReports] of Object.entries(groupedReports)) {
            const [eventType, dateStr] = groupKey.split('_');
            const uploadType = `track-${eventType}`;
            const fileName = `${uploadType}_${dateStr}.json`;
            const filePathInRepo = `${uploadType}/${fileName}`; // 仓库内相对路径
            const branchName = `backup_track_raw-data_${eventType}`; // 分支名按事件类型隔离

            console.debug(`${logTime()} 开始处理分组:${groupKey}, 目标分支: ${branchName}, 文件:${filePathInRepo}`);

            // *** 核心改动：使用 safeWriteToBranch 并传入 contentProcessor ***
            await safeWriteToBranch(
                repoGit,
                tempDir,
                GITEE_MASTER_BRANCH,
                branchName,
                true, // 更新埋点数据，需要备份历史文件， 因为我们是把每天的文件写到一个分支里，几个月左右 请手动提取一下，或者后续再优化
                filePathInRepo,
                '', // fileContent 在使用 contentProcessor 时被忽略，但必须传一个值
                `chore: append raw tracking data for ${eventType} on${dateStr}`,
                [branchName], // 删除并重建此分支
                // *** 核心：定义内容处理逻辑 ***
                (oldContent: string | null): string => {
                    let existingReports: OperationTrackingParams<EventType>[] = [];
                    if (oldContent) {
                        try {
                            const parsed = JSON.parse(oldContent);
                            if (Array.isArray(parsed)) {
                                existingReports = parsed;
                            } else {
                                console.warn(`${logTime()} 文件${filePathInRepo} 的现有内容不是数组格式，将被覆盖。`);
                            }
                        } catch (e) {
                            console.error(`${logTime()} 解析文件${filePathInRepo} 的旧内容失败，将覆盖写入。`, e);
                        }
                    }

                    // 合并新旧数据
                    const mergedReports = [...existingReports, ...newReports];
                    console.debug(`${logTime()} 文件${filePathInRepo} 数据合并完成，旧数据: ${existingReports.length}, 新数据:${newReports.length}, 总计: ${mergedReports.length}`);

                    // 返回合并后的新内容
                    return JSON.stringify(mergedReports, null, 2);
                }
            );
            console.log(`${logTime()} 分组${groupKey} 处理完毕，数据已安全追加到分支 ${branchName}`);
        }

        // 清理临时目录
        fs.rmSync(tempDir, {recursive: true, force: true});
        console.debug(`${logTime()} 下载仓库临时目录已清理`);

        console.log(`${logTime()} 所有埋点数据已成功写入下载仓库的相应备份分支`);

    } catch (error) {
        console.error(`${logTime()} 写入埋点数据失败:`, error);
        throw error;
    }
}

/**
 * 主函数：处理完整的流程
 */
export async function main(): Promise<void> {
    try {
        console.log(`${logTime()} 开始执行完整的数据处理流程`);

        // 第一步：处理上传的数据
        const validReports = await scanOperationTrackingFromUploaderRepo();

        // 第二步：上传处理后的数据（无论是否有数据都要执行）
        await mergeTrackingDataAndPushToDownloadRepo(validReports);

        console.log(`${logTime()} 完整的数据处理流程执行完成`);
    } catch (error) {
        console.error(`${logTime()} 主流程执行失败:`, error);
        throw error;
    }
}


// 如果需要直接运行，可以取消注释
main();
