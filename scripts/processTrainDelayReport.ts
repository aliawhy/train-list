import path from "path";
import fs from "fs";
import {simpleGit} from 'simple-git';
import {logTime} from "./utils/log/LogUtils";
import {getBeijingTimeString, getBeijingDateTime} from "./utils/date/DateUtil";
import {encode as msgpackEncoder, decode as msgpackDecoder} from 'msgpack-lite';
import {compress, decompress} from '@mongodb-js/zstd';

// 主分支名称常量
const MASTER_BRANCH = 'master';

export interface TrainDelayParams {
    userUuid: string;
    reportUuid: string; // 避免消费方多次消费导致重复数据
    reportTimestamp: number;
    trainNumber: string;
    position: string;
    delayTimeRange: string;
}

/**
 * 处理晚点信息上报分支
 */
export async function scanTrainDelayReportFromUploaderRepo(): Promise<{ [key: string]: TrainDelayParams[] }> {
    try {
        console.debug(`${logTime()} 开始处理晚点信息上报分支`);

        // 创建临时目录用于克隆和操作
        const tempDir = path.join(process.cwd(), 'temp-train-delay-uploader-repo');

        // 如果临时目录已存在，先删除
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, {recursive: true, force: true});
        }

        // 克隆 Gitee 仓库
        const git = simpleGit();
        await git.clone(process.env.GITEE_MINI_DATA_UPLOADER_URL, tempDir);
        console.debug(`${logTime()} Gitee 上传仓库克隆完成`);

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

        const validReports: { [key: string]: TrainDelayParams[] } = {};
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
                await repoGit.checkout(MASTER_BRANCH);
                console.debug(`${logTime()} 已切换回主分支: ${MASTER_BRANCH}`);

            } catch (branchError) {
                console.error(`${logTime()} 处理分支 ${branch} 时出错:`, branchError);
                // 出错时也要确保切换回主分支
                try {
                    await repoGit.checkout(MASTER_BRANCH);
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
                await repoGit.checkout(MASTER_BRANCH);

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
 */
export async function mergeNewReportAndClearNoneTodayDataThenPushToDownloadRepo(
    validReports: { [key: string]: TrainDelayParams[] }): Promise<void> {
    try {
        console.debug(`${logTime()} 开始上传处理后的数据到下载仓库`);

        // 标志变量初始化
        let hasOldRepo = false;
        let needDeleteOldRepo = false;
        let needCreateNewRepo = false;

        // 数据变量初始化
        let oldReportData: { [key: string]: TrainDelayParams[] } = {};
        let newReportData: { [key: string]: TrainDelayParams[] } = {};
        let mergeReportData: { [key: string]: TrainDelayParams[] } = {};

        // 创建临时目录用于克隆和操作
        const tempDir = path.join(process.cwd(), 'temp-train-delay-downloader-repo');

        // 如果临时目录已存在，先删除
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, {recursive: true, force: true});
        }

        // 克隆下载仓库
        const git = simpleGit();
        await git.clone(process.env.GITEE_MINI_DATA_DOWNLOADER_URL, tempDir);
        console.debug(`${logTime()} Gitee 下载仓库克隆完成`);

        // 切换到克隆的仓库目录
        const repoGit = simpleGit(tempDir);

        // 获取所有分支
        const branchesResult = await repoGit.branch();
        const allBranches = branchesResult.all;
        console.debug(`${logTime()} 获取到下载仓库所有分支数量:${allBranches.length}`);

        const downloadType = 'train-delay-download';

        // 查找现有的下载分支
        const existingDownloadBranches = allBranches.filter(branch =>
            branch.includes(downloadType)
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
            await repoGit.checkout(MASTER_BRANCH);
        }

        // 获取当前北京日期字符串
        const currentBeijingDate = getBeijingTimeString(Date.now(), 'date');
        console.debug(`${logTime()} 当前北京日期: ${currentBeijingDate}`);

        /**
         * 过滤北京时区当天的数据
         * @param reports 待过滤的数据
         * @returns 过滤后的当天数据
         */
        const filterTodayReports = (reports: TrainDelayParams[]): TrainDelayParams[] => {
            return reports.filter(report => {
                const reportBeijingDate = getBeijingTimeString(report.reportTimestamp, 'date');
                return reportBeijingDate === currentBeijingDate;
            });
        };

        // 处理流程1：先对新旧数据分别过滤北京时区当天的数据
        const filteredOldData: { [key: string]: TrainDelayParams[] } = {};
        const filteredNewData: { [key: string]: TrainDelayParams[] } = {};

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
            const uniqueReports: TrainDelayParams[] = [];

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

            await repoGit.checkoutBranch(newBranchName, MASTER_BRANCH);

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

/**
 * 校验晚点信息数据结构
 */
function isValidTrainDelayReport(data: any): data is TrainDelayParams {
    if (!data || typeof data !== 'object') {
        return false;
    }

    // 检查字段数量
    const keys = Object.keys(data);
    if (keys.length !== 6) {
        return false;
    }

    // 检查必需字段
    const requiredFields = ['userUuid', 'reportUuid', 'reportTimestamp', 'trainNumber', 'position', 'delayTimeRange'];
    for (const field of requiredFields) {
        if (!keys.includes(field)) {
            return false;
        }
    }

    // 校验字段类型
    return typeof data.userUuid === 'string' &&
        typeof data.reportUuid === 'string' &&
        typeof data.reportTimestamp === 'number' &&
        typeof data.trainNumber === 'string' &&
        typeof data.position === 'string' &&
        typeof data.delayTimeRange === 'string';
}

// 如果需要直接运行，可以取消注释
main();
