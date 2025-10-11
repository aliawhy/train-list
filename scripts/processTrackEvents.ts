import path from "path";
import fs from "fs";
import {simpleGit} from 'simple-git';
import {logTime} from "./utils/log/LogUtils";
import {getBeijingTimeString} from "./utils/date/DateUtil";
import {EventType, OperationTrackingParams} from "./utils/operation-tracking/OperationTrackingEntity";

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
 * ╔════════════════════════════════════════════════════════════╗
 * ║                     2. 数据写入函数                           ║
 * ╚════════════════════════════════════════════════════════════╝
 *
 * 功能：将清洗后的埋点数据，按类型和日期追加到 Gitee 下载仓库的固定分支。
 * 1. 按 eventType 和北京日期对数据进行分组。
 * 2. 克隆 Gitee 下载仓库。
 * 3. 检出或创建固定的 `backup_track_raw-data` 分支。
 * 4. 遍历每个分组，读取对应文件的旧数据，追加新数据，然后写入 JSON 文件。
 * 5. 提交所有更改并推送到 `backup_track_raw-data` 分支。
 *    该分支作为运营人员使用的原始数据备份，永远包含最新的全量数据。
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
        console.debug(`${logTime()} 数据分组完成，共 ${Object.keys(groupedReports).length} 个分组`);

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

        // 2. 检出或创建固定的数据备份分支
        const BACKUP_BRANCH_NAME = 'backup_track_raw-data';
        const branches = await repoGit.branch();

        // 检查远程分支是否存在
        const remoteBackupBranchExists = branches.all.includes(`remotes/origin/${BACKUP_BRANCH_NAME}`);

        if (branches.all.includes(BACKUP_BRANCH_NAME)) {
            await repoGit.checkout(BACKUP_BRANCH_NAME);
            console.debug(`${logTime()} 已切换到现有备份分支: ${BACKUP_BRANCH_NAME}`);
        } else {
            // 从主分支创建新的备份分支
            await repoGit.checkoutBranch(BACKUP_BRANCH_NAME, GITEE_MASTER_BRANCH);
            console.debug(`${logTime()} 已从主分支创建新的备份分支: ${BACKUP_BRANCH_NAME}`);
        }

        // 3. 仅在远程分支存在时，才拉取最新代码以避免冲突
        if (remoteBackupBranchExists) {
            console.debug(`${logTime()} 远程分支 ${BACKUP_BRANCH_NAME} 存在，正在拉取最新代码...`);
            try {
                await repoGit.pull('origin', BACKUP_BRANCH_NAME, { '--rebase': true });
                console.debug(`${logTime()} 远程分支 ${BACKUP_BRANCH_NAME} 拉取成功。`);
            } catch (pullError) {
                console.error(`${logTime()} 拉取远程分支 ${BACKUP_BRANCH_NAME} 失败，但继续执行。`, pullError);
                // 如果是rebase冲突，可以选择放弃rebase，重置到拉取前的状态
                await repoGit.rebase(['--abort']);
            }
        } else {
            console.debug(`${logTime()} 远程分支 ${BACKUP_BRANCH_NAME} 不存在，跳过拉取。`);
        }

        // 4. 遍历分组，在当前分支上追加或创建文件
        for (const [groupKey, newReports] of Object.entries(groupedReports)) {
            const [eventType, dateStr] = groupKey.split('_');
            const uploadType = `track-${eventType}`;
            // 文件名格式: track-事件类型_北京时区日期.json
            const fileName = `${uploadType}_${dateStr}.json`;
            const filePath = path.join(tempDir, uploadType, fileName);

            console.debug(`${logTime()} 开始处理分组: ${groupKey}, 文件: ${filePath}`);

            // 读取旧数据并追加
            let existingReports: OperationTrackingParams<EventType>[] = [];
            if (fs.existsSync(filePath)) {
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    existingReports = JSON.parse(content);
                    if (!Array.isArray(existingReports)) {
                        console.warn(`${logTime()} 文件 ${filePath} 的现有内容不是数组格式，将被覆盖。`);
                        existingReports = [];
                    }
                } catch (e) {
                    console.error(`${logTime()} 读取或解析文件 ${filePath} 失败，将覆盖写入。`, e);
                    existingReports = [];
                }
            }

            const mergedReports = [...existingReports, ...newReports];
            console.debug(`${logTime()} 文件 ${filePath} 数据合并完成，总数据量: ${mergedReports.length}`);

            // 确保目录存在
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, {recursive: true});
            }

            // 写入文件
            fs.writeFileSync(filePath, JSON.stringify(mergedReports, null, 2));
        }

        // 5. 提交所有更改并推送到备份分支
        console.debug(`${logTime()} 开始提交并推送所有更改到 ${BACKUP_BRANCH_NAME}`);
        await repoGit.add('.'); // 添加所有更改
        const commitMessage = `chore: backup raw tracking data - ${new Date().toISOString()}`;
        // 检查是否有需要提交的更改
        const status = await repoGit.status();
        if (!status.isClean()) {
            await repoGit.commit(commitMessage);
            // 增加推送重试逻辑
            let pushSucceeded = false;
            let attempts = 0;
            const maxAttempts = 2;
            while (!pushSucceeded && attempts < maxAttempts) {
                attempts++;
                try {
                    // 首次推送新分支时，需要使用 --set-upstream-to
                    if (attempts === 1 && !remoteBackupBranchExists) {
                        await repoGit.push('origin', BACKUP_BRANCH_NAME, ['--set-upstream-to', `origin/${BACKUP_BRANCH_NAME}`]);
                    } else {
                        await repoGit.push('origin', BACKUP_BRANCH_NAME);
                    }
                    pushSucceeded = true;
                    console.debug(`${logTime()} 备份分支 ${BACKUP_BRANCH_NAME} 已更新并推送`);
                } catch (pushError) {
                    console.error(`${logTime()} 推送失败 (尝试 ${attempts}/${maxAttempts}):`, pushError);
                    if (attempts < maxAttempts) {
                        console.debug(`${logTime()} 推送失败，尝试先拉取最新代码后再次推送...`);
                        try {
                            // 只有在远程分支已存在时才拉取
                            if (remoteBackupBranchExists) {
                                await repoGit.pull('origin', BACKUP_BRANCH_NAME, { '--rebase': true });
                            }
                        } catch (pullErrorOnRetry) {
                            console.error(`${logTime()} 重试时拉取代码失败，放弃本次推送。`, pullErrorOnRetry);
                            await repoGit.rebase(['--abort']);
                            break; // 退出重试循环
                        }
                    }
                }
            }
            if (!pushSucceeded) {
                throw new Error(`推送分支 ${BACKUP_BRANCH_NAME} 失败，已达到最大重试次数。`);
            }
        } else {
            console.debug(`${logTime()} 没有新的文件变更，跳过提交和推送。`);
        }


        // 清理临时目录
        fs.rmSync(tempDir, {recursive: true, force: true});
        console.debug(`${logTime()} 下载仓库临时目录已清理`);

        console.log(`${logTime()} 所有埋点数据已成功写入下载仓库的 ${BACKUP_BRANCH_NAME} 分支`);

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
