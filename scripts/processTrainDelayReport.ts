import path from "path";
import fs from "fs";
import {simpleGit} from 'simple-git';
import {logTime} from "./utils/log/LogUtils";
import {getBeijingDateTime, getBeijingTimeString} from "./utils/date/DateUtil";
import {decode as msgpackDecoder, encode as msgpackEncoder} from 'msgpack-lite';
import {compress, decompress} from '@mongodb-js/zstd';
import {BaseVersionFile} from "./utils/file/FileUtils";
import {allStationsSet} from "./utils/rail-net/railNetChecker";

// 主分支名称常量
const GITHUB_MASTER_BRANCH = 'main';
const GITEE_MASTER_BRANCH = 'master';

export interface TrainReportParams {
    userUuid: string;
    reportUuid: string; // 避免消费方多次消费导致重复数据
    reportTimestamp: number;
    trainNumber: string;
    position: string;
    delayTimeRange: string;
}

/**
 * 处理晚点信息上报分支
 * 使用github仓库，小程序那边上传到github仓库更安全，github仓库可以限定token的访问仓库
 */
export async function scanTrainDelayReportFromUploaderRepo(): Promise<{ [key: string]: TrainReportParams[] }> {
    try {
        console.debug(`${logTime()} 开始处理晚点信息上报分支`);

        // 创建临时目录用于克隆和操作
        const tempDir = path.join(process.cwd(), 'temp-train-delay-uploader-repo');

        // 如果临时目录已存在，先删除
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, {recursive: true, force: true});
        }

        // 克隆仓库
        const git = simpleGit();
        await git.clone(process.env.MY_GITHUB_MINI_DATA_UPLOADER_URL, tempDir);
        console.debug(`${logTime()} github 上传仓库克隆完成`);

        await git.addConfig('user.email', 'action@github.com');
        await git.addConfig('user.name', 'GitHub Action');

        // 切换到克隆的仓库目录
        const repoGit = simpleGit(tempDir);

        // 获取所有分支
        const branchesResult = await repoGit.branch();
        const allBranches = branchesResult.all;
        console.debug(`${logTime()} 获取到所有分支数量: ${allBranches.length}`);

        const uploadType = 'train-delay-upload';
        const currentTime = new Date().getTime();

        // 扩大时间窗口到2小时前后（基于时间戳）
        const windowStart = currentTime - 2 * 60 * 60 * 1000;
        const windowEnd = currentTime + 2 * 60 * 60 * 1000;

        console.debug(`${logTime()} 当前时间戳: ${currentTime}`);
        console.debug(`${logTime()} 时间窗口: ${windowStart} - ${windowEnd}`);

        // 第一步：筛选出符合条件的分支
        const targetBranches = allBranches.filter(branch => {
            if (!branch.includes(uploadType)) {
                return false;
            }

            // 获取实际的分支名称（去掉 remotes/origin/ 前缀）
            const actualBranchName = branch.replace('remotes/origin/', '');

            // 解析分支名称获取时间戳信息
            const branchParts = actualBranchName.split('_');
            if (branchParts.length < 3) {
                console.debug(`${logTime()} 分支 ${branch} 格式不正确，跳过`);
                return false;
            }

            // 获取时间戳部分（倒数第二部分）
            const branchTimestamp = parseInt(branchParts[branchParts.length - 2]);
            if (isNaN(branchTimestamp)) {
                console.debug(`${logTime()} 分支 ${branch} 时间戳格式不正确，跳过`);
                return false;
            }

            // 检查是否在时间窗口内
            const isInWindow = branchTimestamp >= windowStart && branchTimestamp <= windowEnd;
            if (isInWindow) {
                console.debug(`${logTime()} 找到符合条件的分支: ${branch} (时间戳: ${branchTimestamp})`);
            }

            return isInWindow;
        });

        console.debug(`${logTime()} 筛选出符合条件的分支数量: ${targetBranches.length}`);

        const validReports: { [key: string]: TrainReportParams[] } = {};
        const branchesToDelete: string[] = [];

        // 第二步：处理筛选出的分支
        for (const branch of targetBranches) {
            try {
                const actualBranchName = branch.replace('remotes/origin/', '');
                console.debug(`${logTime()} 开始处理分支: ${actualBranchName}`);

                // 切换到该分支
                await repoGit.checkout(['-b', actualBranchName, branch]);
                console.debug(`${logTime()} 已切换到分支: ${actualBranchName}`);

                // 读取文件内容
                const filePath = path.join(tempDir, uploadType, `${uploadType}.json`);
                console.debug(`${logTime()} 检查文件路径: ${filePath}`);

                if (fs.existsSync(filePath)) {
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    console.debug(`${logTime()} 文件内容长度: ${fileContent.length}`);

                    try {
                        // 解析JSON内容
                        const reportData = JSON.parse(fileContent);
                        console.debug(`${logTime()} JSON解析成功`);

                        // 严格校验数据结构
                        if (isValidTrainDelayReport(reportData)) {
                            console.debug(`${logTime()} 分支 ${actualBranchName} 数据校验通过`);

                            // 按车次分组
                            const trainNumber = reportData.trainNumber;
                            if (!validReports[trainNumber]) {
                                validReports[trainNumber] = [];
                            }
                            validReports[trainNumber].push(reportData);
                            branchesToDelete.push(actualBranchName);
                        } else {
                            console.warn(`${logTime()} 分支 ${actualBranchName} 数据校验失败，将删除分支`);
                            branchesToDelete.push(actualBranchName);
                        }
                    } catch (parseError) {
                        console.error(`${logTime()} 分支 ${actualBranchName} JSON解析失败:`, parseError);
                        branchesToDelete.push(actualBranchName);
                    }
                } else {
                    console.warn(`${logTime()} 分支 ${actualBranchName} 文件不存在: ${filePath}`);
                    branchesToDelete.push(actualBranchName);
                }

                // 处理完当前分支后，切换回主分支，避免删除当前分支
                await repoGit.checkout(GITHUB_MASTER_BRANCH);
                console.debug(`${logTime()} 已切换回主分支: ${GITHUB_MASTER_BRANCH}`);

            } catch (branchError) {
                console.error(`${logTime()} 处理分支 ${branch} 时出错:`, branchError);
                // 出错时也要确保切换回主分支
                try {
                    await repoGit.checkout(GITHUB_MASTER_BRANCH);
                } catch (checkoutError) {
                    console.error(`${logTime()} 切换回主分支失败:`, checkoutError);
                }
            }
        }

        // 第三步：删除已处理的分支
        console.debug(`${logTime()} 开始删除已处理的分支，数量: ${branchesToDelete.length}`);
        for (const branch of branchesToDelete) {
            try {
                // 确保在主分支上
                await repoGit.checkout(GITHUB_MASTER_BRANCH);

                // 删除本地分支
                await repoGit.deleteLocalBranch(branch, true);
                console.debug(`${logTime()} 已删除本地分支: ${branch}`);

                // 删除远程分支
                await repoGit.push(['origin', '--delete', branch]);
                console.debug(`${logTime()} 已删除远程分支: ${branch}`);
            } catch (deleteError) {
                console.error(`${logTime()} 删除分支 ${branch} 失败:`, deleteError);
            }
        }

        // 清理临时目录
        fs.rmSync(tempDir, {recursive: true, force: true});
        console.debug(`${logTime()} 上传仓库临时目录已清理`);

        console.log(`${logTime()} 晚点信息汇总结果:`);
        console.log(JSON.stringify(validReports, null, 2));

        return validReports;

    } catch (error) {
        console.error(`${logTime()} 处理晚点信息上报失败:`, error);
        throw error;
    }
}

/**
 * 上传处理后的数据到下载仓库
 * 使用gitee仓库， 国内用户访问gitee比较快
 * 更新依据：
 * 1. 初始无分支，无上报：会创建空{}分支
 * 2. 昨天有数据，今天无上报：第一次运行时会清空数据（创建空{}分支），后续运行会跳过更新
 * 3. 有新上报数据：正常更新
 *
 * 处理流程（优化版）：
 * 1. 先对新旧数据分别过滤北京时区当天的数据
 * 2. 基于车次进行数据合并，使用Set高效去重（基于reportUuid）
 * 3. 对合并后的数据按上报时间戳排序
 * 4. 根据更新依据决定是否创建新分支和删除旧分支
 * 5. (新增) 如果存在旧数据且旧数据中不包含当天数据，则将旧数据备份到新分支
 * 6. (新增) 如果创建了新的数据分支，则更新固定的版本分支
 */
export async function mergeNewReportAndClearNoneTodayDataThenPushToDownloadRepo(
    validReports: { [key: string]: TrainReportParams[] }): Promise<void> {
    try {
        console.debug(`${logTime()} 开始上传处理后的数据到下载仓库`);

        // 标志变量初始化
        let hasOldRepo = false;
        let needDeleteOldRepo = false;
        let needCreateNewRepo = false;

        // 数据变量初始化
        let oldReportData: { [key: string]: TrainReportParams[] } = {};
        let newReportData: { [key: string]: TrainReportParams[] } = {};
        let mergeReportData: { [key: string]: TrainReportParams[] } = {};

        // 创建临时目录用于克隆和操作
        const tempDir = path.join(process.cwd(), 'temp-train-delay-downloader-repo');

        // 如果临时目录已存在，先删除
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, {recursive: true, force: true});
        }

        // 克隆下载仓库
        const git = simpleGit();
        if (!process.env.GITEE_MINI_DATA_DOWNLOADER_URL) {
            throw new Error('GITEE_MINI_DATA_DOWNLOADER_URL environment variable is not set.');
        }
        await git.clone(process.env.GITEE_MINI_DATA_DOWNLOADER_URL, tempDir);
        console.debug(`${logTime()} Gitee 下载仓库克隆完成`);

        // 切换到克隆的仓库目录
        const repoGit = simpleGit(tempDir);

        await repoGit.addConfig('user.email', 'action@github.com');
        await repoGit.addConfig('user.name', 'GitHub Action');

        // 获取所有分支
        const branchesResult = await repoGit.branch();
        const allBranches = branchesResult.all;
        console.debug(`${logTime()} 获取到下载仓库所有分支数量:${allBranches.length}`);

        const downloadType = 'train-delay-download';

        // 查找现有的下载分支 (修改：只查找以downloadType开头的分支)
        const existingDownloadBranches = allBranches.filter(branch =>
            // 注意：simpleGit 操作的是本地完整仓库，其分支列表包含本地和远程引用。
            // 必须使用 'remotes/origin/' 前缀来精确筛选远程分支，以区别于同名的本地分支。
            branch.indexOf('remotes/origin/' + downloadType) === 0
        );
        console.debug(`${logTime()} 找到现有下载分支数量:${existingDownloadBranches.length}`);

        // 获取旧数据（如果有的话）
        if (existingDownloadBranches.length > 0) {
            hasOldRepo = true;
            const latestBranch = existingDownloadBranches[existingDownloadBranches.length - 1];
            const actualBranchName = latestBranch.replace('remotes/origin/', '');

            try {
                await repoGit.checkout(['-b', actualBranchName, latestBranch]);
                const filePath = path.join(tempDir, downloadType, `${downloadType}.msgpack.zst`);

                if (fs.existsSync(filePath)) {
                    // 读取压缩文件
                    const compressedData = fs.readFileSync(filePath);
                    console.debug(`${logTime()} 读取到压缩文件，大小: ${compressedData.length} bytes`);

                    // 解压缩
                    const decompressedData = await decompress(compressedData);
                    console.debug(`${logTime()} 解压缩完成，大小: ${decompressedData.length} bytes`);

                    // 解码msgpack
                    oldReportData = msgpackDecoder(decompressedData);
                    console.debug(`${logTime()} 读取到旧数据，车次数量:${Object.keys(oldReportData).length}`);
                }
            } catch (error) {
                console.debug(`${logTime()} 读取旧数据失败，继续正常流程:`, error);
            }

            // 切换回主分支
            await repoGit.checkout(GITEE_MASTER_BRANCH);
        }

        // 获取当前北京日期字符串
        const currentBeijingDate = getBeijingTimeString(Date.now(), 'date');
        console.debug(`${logTime()} 当前北京日期: ${currentBeijingDate}`);

        /**
         * 过滤北京时区当天的数据
         * @param reports 待过滤的数据
         * @returns 过滤后的当天数据
         */
        const filterTodayReports = (reports: TrainReportParams[]): TrainReportParams[] => {
            return reports.filter(report => {
                const reportBeijingDate = getBeijingTimeString(report.reportTimestamp, 'date');
                return reportBeijingDate === currentBeijingDate;
            });
        };

        // 处理流程1：先对新旧数据分别过滤北京时区当天的数据
        const filteredOldData: { [key: string]: TrainReportParams[] } = {};
        const filteredNewData: { [key: string]: TrainReportParams[] } = {};

        // 过滤旧数据的当天数据
        for (const [trainNumber, reports] of Object.entries(oldReportData)) {
            const todayReports = filterTodayReports(reports);
            if (todayReports.length > 0) {
                filteredOldData[trainNumber] = todayReports;
            }
        }

        // 过滤新上报数据的当天数据
        for (const [trainNumber, reports] of Object.entries(validReports)) {
            const todayReports = filterTodayReports(reports);
            if (todayReports.length > 0) {
                filteredNewData[trainNumber] = todayReports;
            }
        }

        console.debug(`${logTime()} 过滤后旧数据车次数量:${Object.keys(filteredOldData).length}`);
        console.debug(`${logTime()} 过滤后新数据车次数量:${Object.keys(filteredNewData).length}`);

        // ===== 新增逻辑：跨天数据备份 =====
        // 如果旧数据存在，但过滤后没有当天数据，说明发生了跨天，需要备份
        if (Object.keys(oldReportData).length > 0 && Object.keys(filteredOldData).length === 0) {
            await backupPreviousDayData(repoGit, tempDir, oldReportData, downloadType);
        }
        // ===============================

        // 处理流程2：基于车次进行数据合并，使用Set高效去重
        // 获取所有车次（过滤后的旧数据 + 过滤后的新数据）
        const allTrainNumbers = new Set([
            ...Object.keys(filteredOldData),
            ...Object.keys(filteredNewData)
        ]);

        for (const trainNumber of allTrainNumbers) {
            const oldReports = filteredOldData[trainNumber] || [];
            const newReports = filteredNewData[trainNumber] || [];

            // 使用Set进行高效去重
            const uuidSet = new Set<string>();
            const uniqueReports: TrainReportParams[] = [];

            // 先处理旧数据
            for (const report of oldReports) {
                if (!uuidSet.has(report.reportUuid)) {
                    uuidSet.add(report.reportUuid);
                    uniqueReports.push(report);
                }
            }

            // 再处理新数据
            for (const report of newReports) {
                if (!uuidSet.has(report.reportUuid)) {
                    uuidSet.add(report.reportUuid);
                    uniqueReports.push(report);
                }
            }

            // 处理流程3：对合并后的数据按上报时间戳排序
            if (uniqueReports.length > 0) {
                uniqueReports.sort((a, b) => a.reportTimestamp - b.reportTimestamp);
                mergeReportData[trainNumber] = uniqueReports;
                console.debug(`${logTime()} 车次${trainNumber} 处理完成，数据量: ${uniqueReports.length}`);
            }
        }

        // 计算数据长度
        const oldReportDataLen = Object.keys(oldReportData).length;
        const newReportDataLen = Object.keys(validReports).length;
        const mergeReportDataLen = Object.keys(mergeReportData).length;
        const filteredOldDataLen = Object.keys(filteredOldData).length;

        console.debug(`${logTime()} 数据统计 - 旧数据车次:${oldReportDataLen}, 过滤后旧数据车次:${filteredOldDataLen}, 新数据车次: ${newReportDataLen}, 合并后车次:${mergeReportDataLen}`);

        // 根据更新依据设置标志位
        if (!hasOldRepo) {
            // 情况1：初始化
            needCreateNewRepo = true;
            needDeleteOldRepo = false;
            console.debug(`${logTime()} 初始化场景 - 首次运行，创建初始分支`);
        } else if (newReportDataLen > 0) {
            // 情况2：有新数据
            needCreateNewRepo = true;
            needDeleteOldRepo = true;
            console.debug(`${logTime()} 有新数据场景 - 创建新分支并替换旧分支`);
        } else if (oldReportDataLen > 0 && mergeReportDataLen === 0) {
            // 情况3：跨天无新数据
            needCreateNewRepo = true;
            needDeleteOldRepo = true; // 永远都只保留1个分支，避免分支膨胀
            console.debug(`${logTime()} 跨天清理场景 - 旧数据非当天数据，创建空分支清空数据`);
        } else {
            // 情况4：后续无新数据且已清空
            needCreateNewRepo = false;
            needDeleteOldRepo = false;
            console.debug(`${logTime()} 无需更新场景 - 没有新数据，且合并后数据不为空，说明合并后数据都来自旧数据`);
        }

        console.debug(`${logTime()} 操作决策 - 创建新分支:${needCreateNewRepo}, 删除旧分支: ${needDeleteOldRepo}`);

        // 执行操作
        if (needCreateNewRepo) {
            // 创建新分支
            const newBranchName = `${downloadType}_${getBeijingDateTime()}_${Date.now()}`;
            console.debug(`${logTime()} 创建新分支:${newBranchName}`);

            await repoGit.checkoutBranch(newBranchName, GITEE_MASTER_BRANCH);

            // 确保目录存在
            const downloadDir = path.join(tempDir, downloadType);
            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir, {recursive: true});
            }

            // 使用msgpack编码
            const msgpackBuffer = msgpackEncoder(mergeReportData);
            console.debug(`${logTime()} 数据保存：msgpack编码完毕，大小: ${msgpackBuffer.length} bytes`);

            // zstd压缩
            let compressedData = await compress(msgpackBuffer, 19);
            console.debug(`${logTime()} 数据保存：zstd压缩完毕，大小: ${compressedData.length} bytes`);

            const fileName = `${downloadType}.msgpack.zst`;
            const filePath = path.join(downloadDir, fileName);

            // 写入压缩数据
            fs.writeFileSync(filePath, compressedData);
            console.debug(`${logTime()} 数据已写入文件:${filePath}`);

            // 提交并推送
            await repoGit.add(filePath);
            await repoGit.commit(`Update train delay data - ${new Date().toISOString()}`);
            await repoGit.push('origin', newBranchName);
            console.debug(`${logTime()} 新分支已推送到远程仓库`);

            // ===== 新增逻辑：更新版本分支 =====
            const newFileName = `${downloadType}/${fileName}`; // 用于拼接url地址，所以直接写/作为连接符
            await updateVersionBranch(repoGit, tempDir, downloadType, newBranchName, newFileName);
            // ===============================
        }

        if (needDeleteOldRepo) {
            // 删除旧的下载分支
            for (const branch of existingDownloadBranches) {
                try {
                    const actualBranchName = branch.replace('remotes/origin/', '');
                    await repoGit.deleteLocalBranch(actualBranchName, true);
                    await repoGit.push(['origin', '--delete', actualBranchName]);
                    console.debug(`${logTime()} 已删除旧分支:${actualBranchName}`);
                } catch (deleteError) {
                    console.error(`${logTime()} 删除旧分支${branch} 失败:`, deleteError);
                }
            }
        }

        // 清理临时目录
        fs.rmSync(tempDir, {recursive: true, force: true});
        console.debug(`${logTime()} 下载仓库临时目录已清理`);

        if (needCreateNewRepo) {
            console.log(`${logTime()} 数据上传完成，新分支已创建，车次数量:${mergeReportDataLen}`);
        } else {
            console.log(`${logTime()} 无需更新，跳过上传操作`);
        }

    } catch (error) {
        console.error(`${logTime()} 上传处理后的数据失败:`, error);
        throw error;
    }
}

/**
 * 备份前一天的数据到固定的备份分支
 * @param repoGit Git操作实例
 * @param tempDir 临时仓库目录
 * @param dataToBackup 需要备份的原始数据
 * @param downloadType 下载类型前缀 (用于生成目录名)
 */
async function backupPreviousDayData(
    repoGit: simpleGit.SimpleGit,
    tempDir: string,
    dataToBackup: { [key: string]: TrainReportParams[] },
    downloadType: string
): Promise<void> {
    // 定义固定的备份分支名和目录名
    const backupBranchName = `backup_${downloadType}_raw-data`;
    const backupDirName = downloadType; // 例如: "train-delay"

    try {
        // 计算昨天的北京日期字符串
        const yesterdayTimestamp = Date.now() - 24 * 60 * 60 * 1000;
        const yesterdayBeijingDate = getBeijingTimeString(yesterdayTimestamp, 'date');

        console.log(`${logTime()} 检测到跨天，开始备份前一天的数据到分支: ${backupBranchName}`);

        // 1. 切换到备份分支。如果本地分支不存在，它会自动从远程的同名分支创建。
        //    如果远程也不存在，则基于 GITEE_MASTER_BRANCH 创建一个新分支。
        try {
            await repoGit.checkout(backupBranchName);
        } catch (checkoutError) {
            // 如果本地和远程都不存在该分支，则从主分支创建
            console.log(`${logTime()} 备份分支 ${backupBranchName} 不存在，将从主分支 ${GITEE_MASTER_BRANCH} 创建。`);
            await repoGit.checkoutBranch(backupBranchName, GITEE_MASTER_BRANCH);
        }

        // 2. 拉取远程备份分支的最新代码，以避免推送冲突
        console.log(`${logTime()} 正在拉取远程分支 ${backupBranchName} 的最新更新...`);
        try {
            await repoGit.pull('origin', backupBranchName, { '--rebase': true });
            console.log(`${logTime()} 远程分支 ${backupBranchName} 拉取成功。`);
        } catch (pullError) {
            console.error(`${logTime()} 拉取远程分支 ${backupBranchName} 失败，但继续执行。`, pullError);
            // 如果是rebase冲突，可以选择放弃rebase，重置到拉取前的状态
            await repoGit.rebase(['--abort']);
        }

        // 3. 确保备份目录存在 (例如: train-delay/)
        const backupDir = path.join(tempDir, backupDirName);
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, {recursive: true});
        }

        // 4. 将数据写入JSON文件
        const fileName = `${yesterdayBeijingDate}.json`;
        const filePath = path.join(backupDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(dataToBackup, null, 2), 'utf-8');
        console.log(`${logTime()} 前一天数据已写入备份文件: ${filePath}`);

        // 5. 提交并推送备份分支 (增加重试逻辑)
        await repoGit.add(filePath);
        const commitMessage = `Backup data for ${yesterdayBeijingDate}`;
        await repoGit.commit(commitMessage);

        console.log(`${logTime()} 开始推送备份分支 ${backupBranchName}...`);
        let pushSucceeded = false;
        let attempts = 0;
        const maxAttempts = 2;

        while (!pushSucceeded && attempts < maxAttempts) {
            attempts++;
            try {
                await repoGit.push('origin', backupBranchName);
                pushSucceeded = true;
                console.log(`${logTime()} 备份分支 ${backupBranchName} 已成功推送到远程仓库`);
            } catch (pushError) {
                console.error(`${logTime()} 推送失败 (尝试 ${attempts}/${maxAttempts}):`, pushError);
                if (attempts < maxAttempts) {
                    console.log(`${logTime()} 推送失败，尝试先拉取最新代码后再次推送...`);
                    try {
                        // 在重试前再次拉取，确保与远程同步
                        await repoGit.pull('origin', backupBranchName, { '--rebase': true });
                    } catch (pullErrorOnRetry) {
                        console.error(`${logTime()} 重试时拉取代码失败，放弃本次推送。`, pullErrorOnRetry);
                        // 放弃rebase，避免后续操作在错误状态下进行
                        await repoGit.rebase(['--abort']);
                        break; // 退出重试循环
                    }
                }
            }
        }

        if (!pushSucceeded) {
            throw new Error(`推送分支 ${backupBranchName} 失败，已达到最大重试次数。`);
        }

        // 6. 切换回主分支，避免影响后续操作
        await repoGit.checkout(GITEE_MASTER_BRANCH);

    } catch (error) {
        console.error(`${logTime()} 备份前一天数据失败:`, error);
        // 备份失败不应中断主流程，仅记录错误
    }
}

/**
 * 更新版本分支，写入最新的数据分支信息
 * @param repoGit Git实例
 * @param tempDir 仓库临时目录
 * @param downloadType 下载类型
 * @param newBranchName 新创建的数据分支名
 * @param newFileName 新创建的数据压缩文件相对路径
 */
async function updateVersionBranch(
    repoGit: simpleGit.SimpleGit,
    tempDir: string,
    downloadType: string,
    newBranchName: string,
    newFileName: string
): Promise<void> {
    const versionBranchName = `version_${downloadType}`;
    const fileNameVersion = `${downloadType}.version.json`;
    const versionDir = path.join(tempDir, 'version');
    const filePathVer = path.join(versionDir, fileNameVersion);

    console.debug(`${logTime()} 开始更新版本分支:${versionBranchName}`);

    try {
        // 检查版本分支是否已存在于远程
        const remoteBranches = await repoGit.branch(['-r']);
        const versionBranchExists = remoteBranches.all.includes(`origin/${versionBranchName}`);

        if (versionBranchExists) {
            // 如果分支存在，检出它
            console.debug(`${logTime()} 版本分支${versionBranchName} 已存在，检出该分支`);
            await repoGit.checkout(versionBranchName);
        } else {
            // 如果分支不存在，从主分支创建它
            console.debug(`${logTime()} 版本分支${versionBranchName} 不存在，从主分支创建`);
            await repoGit.checkoutBranch(versionBranchName, GITEE_MASTER_BRANCH);
        }

        // 确保版本目录存在
        if (!fs.existsSync(versionDir)) {
            fs.mkdirSync(versionDir, {recursive: true});
        }

        // 版本文件内容
        const versionData = {
            _version: newBranchName,
            _fileName: newFileName,
        } as BaseVersionFile;

        // 写入版本文件
        fs.writeFileSync(filePathVer, JSON.stringify(versionData, null, 2));
        console.debug(`${logTime()} 数据保存：版本文件写入完毕，文件名=${fileNameVersion}, 路径=${filePathVer}`);

        // 提交并推送版本分支
        await repoGit.add(filePathVer);
        const commitMessage = `Update version info to ${newBranchName} -${new Date().toISOString()}`;
        await repoGit.commit(commitMessage);
        await repoGit.push('origin', versionBranchName);
        console.debug(`${logTime()} 版本分支${versionBranchName} 已更新并推送到远程`);

    } catch (error) {
        console.error(`${logTime()} 更新版本分支失败:`, error);
        // 不抛出错误，避免影响主流程
    } finally {
        // 切换回主分支，保持仓库状态干净
        await repoGit.checkout(GITEE_MASTER_BRANCH);
    }
}
const DELAY_TIME_RANGE_OPTIONS = [
    '晚点 1-5 分钟',
    '晚点 6-10 分钟',
    '晚点 11-15 分钟',
    '晚点 16-20 分钟',
    '晚点 21-25 分钟',
    '晚点 26-30 分钟',
    '晚点 超过30分钟',
    '正点'
];

/**
 * 校验列车晚点上报的数据是否合法
 * @param data 待校验的数据
 * @returns 如果数据是合法的 TrainReportParams 类型，则返回 true，否则返回 false
 */
function isValidTrainDelayReport(data: any): data is TrainReportParams {
    // 将必需字段数组提前定义，便于统一管理和维护
    const requiredFields = ['userUuid', 'reportUuid', 'reportTimestamp', 'trainNumber', 'position', 'delayTimeRange'];

    // 1. 基础类型和空值检查
    if (!data || typeof data !== 'object') {
        return false;
    }

    // 2. 检查字段数量，确保没有多余或缺失的字段，我们的json文件是直接被下载的，接口是公开的，如果有多余字段，导致隐藏字段攻击风险，比如隐藏字段使用非法文字
    if (Object.keys(data).length !== requiredFields.length) {
        return false;
    }

    // 3. 检查必需字段是否存在
    for (const field of requiredFields) {
        if (!(field in data)) { // 使用 in 操作符比 keys.includes 更高效
            return false;
        }
    }

    // 4. 校验字段类型
    const isTypeValid = typeof data.userUuid === 'string' &&
        typeof data.reportUuid === 'string' &&
        typeof data.reportTimestamp === 'number' &&
        typeof data.trainNumber === 'string' &&
        typeof data.position === 'string' &&
        typeof data.delayTimeRange === 'string';

    if (!isTypeValid) {
        return false;
    }

    // 5. 校验 UUID 字段长度 (允许未来格式的冗余)
    // 标准UUID是32个字符，我们放宽到50个字符以应对未来变化。
    const MAX_UUID_LENGTH = 50;
    if (data.userUuid.length > MAX_UUID_LENGTH || data.reportUuid.length > MAX_UUID_LENGTH) {
        return false;
    }

    // 6. 校验时间戳字段的合法数值范围
    // new Date().getTime() 返回的是毫秒级时间戳。
    // 范围：大于0，且小于2999年最后一刻的时间戳。
    const maxTimestamp = new Date('2999-12-31T23:59:59.999Z').getTime();
    if (data.reportTimestamp <= 0 || data.reportTimestamp > maxTimestamp) {
        return false;
    }

    // 7. 确保 delayTimeRange 的值是预定义选项中的一个
    if (!DELAY_TIME_RANGE_OPTIONS.includes(data.delayTimeRange)) {
        return false;
    }

    // 8. 确保 position 是合法的
    const isPositionValid = allStationsSet.has(data.position) || data.position === '列车上';
    if (!isPositionValid) {
        return false;
    }

    // 9. 确保车次是合法的：1位大写字母 + 3或4位数字
    const trainNumberRegex = /^[A-Z]\d{3,4}$/;
    const isTrainNumberValid = trainNumberRegex.test(data.trainNumber);
    if (!isTrainNumberValid) {
        return false;
    }

    // 10. 所有校验通过
    return true;
}

/**
 * 主函数：处理完整的流程
 */
export async function main(): Promise<void> {
    try {
        console.log(`${logTime()} 开始执行完整的数据处理流程`);

        // 第一步：处理上传的数据
        const validReports = await scanTrainDelayReportFromUploaderRepo();

        // 第二步：上传处理后的数据（无论是否有数据都要执行）
        await mergeNewReportAndClearNoneTodayDataThenPushToDownloadRepo(validReports);

        console.log(`${logTime()} 完整的数据处理流程执行完成`);
    } catch (error) {
        console.error(`${logTime()} 主流程执行失败:`, error);
        throw error;
    }
}


// 如果需要直接运行，可以取消注释
main();
