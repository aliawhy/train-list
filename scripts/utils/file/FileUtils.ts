import {encode as msgpackEncoder} from 'msgpack-lite';
import pako from 'pako';
import {logTime} from "../log/LogUtils";
import path from "path";
import fs from "fs";
import {getBeijingDateTime} from "../date/DateUtil";
import {TrainDetailMap} from "../../processGDCJ";
import {simpleGit, SimpleGit} from 'simple-git';
import {compress} from '@mongodb-js/zstd';
import {decode as msgpackDecoder} from 'msgpack-lite';
import {decompress} from '@mongodb-js/zstd';

export interface BaseVersionFile {
    _version: string;
    _fileName: string;
}

// =================================================================
// 关键改动 1: 新增顶部常量，用于指定需要从历史数据中保护的日期
// 格式为 'YYYY-MM-DD'，与 TrainDetailMap 的 key 格式保持一致
// =================================================================
const PROTECTED_HISTORY_DATES: string[] = [
    '2025-10-24',
];

/**
 * 从 Gitee 仓库加载最新的历史数据，并将指定的日期数据合并到新的 result 中
 * @param __dirname 当前脚本目录
 * @param result 新获取的 TrainDetailMap
 */
async function loadAndMergeHistory(__dirname: string, result: TrainDetailMap): Promise<void> {
    if (PROTECTED_HISTORY_DATES.length === 0) {
        console.debug(`${logTime()} 没有配置需要保护的历史日期，跳过历史数据加载。`);
        return;
    }

    console.log(`${logTime()} 开始加载历史数据以保护日期: ${PROTECTED_HISTORY_DATES.join(', ')}`);
    const fileDir = path.join(__dirname, '..', 'data', 'gdcj-train-detail');
    const tempRepoDir = path.join(fileDir, 'temp-repo-for-history');
    const versionFileName = `gdcj.version.json`;

    try {
        // =================================================================
        // 关键改动 2: 在读取历史数据前，先克隆仓库
        // =================================================================
        const git = simpleGit();
        const giteeUrl = process.env.GITEE_URL;
        if (!giteeUrl) {
            throw new Error("GITEE_URL 环境变量未设置");
        }

        if (fs.existsSync(tempRepoDir)) {
            fs.rmSync(tempRepoDir, {recursive: true, force: true});
        }
        await git.clone(giteeUrl, tempRepoDir);
        console.debug(`${logTime()} 用于读取历史的仓库克隆完成。`);

        // 读取版本文件
        const versionFilePath = path.join(tempRepoDir, 'data', 'gdcj', versionFileName);
        if (!fs.existsSync(versionFilePath)) {
            console.warn(`${logTime()} 历史版本文件不存在: ${versionFilePath}。无法合并历史数据。`);
            return;
        }
        const versionData: BaseVersionFile = JSON.parse(fs.readFileSync(versionFilePath, 'utf-8'));
        const historyFileName = versionData._fileName;
        console.debug(`${logTime()} 找到历史版本文件: ${historyFileName}`);

        // 读取并解压历史数据文件
        const historyFilePath = path.join(tempRepoDir, 'data', 'gdcj', historyFileName);
        if (!fs.existsSync(historyFilePath)) {
            console.warn(`${logTime()} 历史数据文件不存在: ${historyFilePath}。无法合并历史数据。`);
            return;
        }

        const compressedHistoryData = fs.readFileSync(historyFilePath);
        const msgpackBuffer = await decompress(compressedHistoryData);
        const oldResult: TrainDetailMap = msgpackDecoder(msgpackBuffer);
        console.debug(`${logTime()} 历史数据解压和解码完毕。`);

        // 合并数据
        let mergedCount = 0;
        for (const dateKey of PROTECTED_HISTORY_DATES) {
            if (oldResult[dateKey]) {
                // 用历史数据覆盖新数据
                result[dateKey] = oldResult[dateKey];
                mergedCount++;
                console.debug(`${logTime()} 已用历史数据覆盖日期: ${dateKey}`);
            } else {
                console.warn(`${logTime()} 在历史数据中未找到日期: ${dateKey} 的记录，无法覆盖。`);
            }
        }
        console.log(`${logTime()} 历史数据合并完成，共覆盖 ${mergedCount} 个日期。`);

    } catch (error) {
        // =================================================================
        // 关键改动 3: 做好异常捕获，不影响主流程
        // =================================================================
        console.error(`${logTime()} 加载或合并历史数据时发生错误，将使用本次获取的原始数据继续执行。错误详情:`, error);
    } finally {
        // 清理临时目录
        if (fs.existsSync(tempRepoDir)) {
            fs.rmSync(tempRepoDir, {recursive: true, force: true});
            console.debug(`${logTime()} 用于读取历史的临时仓库已清理。`);
        }
    }
}


export async function encodeAndSave(__dirname, result: TrainDetailMap) {

    // =================================================================
    // 关键改动 4: 在主流程最开始，调用历史数据合并函数
    // =================================================================
    await loadAndMergeHistory(__dirname, result);

    const fileDir = path.join(__dirname, '..', 'data', 'gdcj-train-detail'); // 当前在script目录，要..到data目录

    const versionString = getBeijingDateTime()
    const fileName = `gdcj.${versionString}.msgpack.zst`;
    const fileNameVersion = `gdcj.version.json`;

    if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, {recursive: true});
    }

    // 使用msgpack编码
    const msgpackBuffer = msgpackEncoder(result);
    console.debug(`${logTime()} 数据保存：pack编码完毕`);

    let compressedData
    if (false) {
        compressedData = pako.gzip(msgpackBuffer); // gz版本
    } else {
        compressedData = await compress(msgpackBuffer, 19); // zstd
    }
    console.debug(`${logTime()} 数据保存：压缩完毕`);

    // 写入文件
    const filePath = path.join(fileDir, fileName);
    fs.writeFileSync(filePath, compressedData);
    console.debug(`${logTime()} 数据保存：文件写入完毕，文件名=${fileName}, 路径=${filePath}`);

    // 写入版本文件
    const versionData = {
        _version: versionString,
        _fileName: fileName
    } as BaseVersionFile;
    const filePathVer = path.join(fileDir, fileNameVersion);
    fs.writeFileSync(filePathVer, JSON.stringify(versionData));
    console.debug(`${logTime()} 数据保存：文件写入完毕，文件名=${fileNameVersion}, 路径=${filePathVer}`);

    // 推送到 Gitee 仓库
    await pushToGiteeRepo(filePath, fileName, filePathVer, fileNameVersion);
}

/**
 * 推送文件到 Gitee 仓库
 * @param gzFilePath 本地文件路径
 * @param gzFileName 目标文件名
 * @param versionFilePath 版本文件路径
 * @param versionFileName 版本文件名
 */
async function pushToGiteeRepo(gzFilePath: string, gzFileName: string, versionFilePath: string, versionFileName: string) {
    try {
        console.debug(`${logTime()} 开始推送到 Gitee 仓库`);

        // 创建临时目录用于克隆和操作
        const tempDir = path.join(path.dirname(gzFilePath), 'temp-gitee-repo');

        // 如果临时目录已存在，先删除
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, {recursive: true, force: true});
        }

        // 克隆 Gitee 仓库
        const git = simpleGit();
        // https://用户名:GITEE_TOKEN@gitee.com/用户名/仓库名.git
        const giteeUrl = process.env.GITEE_URL;
        if (!giteeUrl) {
            throw new Error("GITEE_URL 环境变量未设置");
        }
        await git.clone(giteeUrl, tempDir);
        console.debug(`${logTime()} Gitee 仓库克隆完成`);

        // 切换到克隆的仓库目录
        const repoGit = simpleGit(tempDir);

        // 确保 /data/gdcj 目录存在
        const targetDir = path.join(tempDir, 'data', 'gdcj');
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, {recursive: true});
        }

        // 复制文件到克隆的仓库的 /data/gdcj 目录
        const targetGzPath = path.join(targetDir, gzFileName);
        const targetVersionPath = path.join(targetDir, versionFileName);

        fs.copyFileSync(gzFilePath, targetGzPath);
        fs.copyFileSync(versionFilePath, targetVersionPath);
        console.debug(`${logTime()} 文件已复制到 Gitee 仓库的 /data/gdcj 目录`);

        // 配置 Git 用户信息
        await repoGit.addConfig('user.name', 'action@github');
        await repoGit.addConfig('user.email', 'action@github');

        // 添加、提交并推送
        await repoGit.add(path.join('data', 'gdcj', gzFileName));
        await repoGit.add(path.join('data', 'gdcj', versionFileName));
        await repoGit.commit(`添加 ${gzFileName} 和 ${versionFileName}`);

        // 推送到 Gitee
        await repoGit.push();
        console.debug(`${logTime()} 文件已成功推送到 Gitee 仓库`);

        // 清理临时目录
        fs.rmSync(tempDir, {recursive: true, force: true});
        console.debug(`${logTime()} 临时目录已清理`);
    } catch (error) {
        console.error(`${logTime()} 推送到 Gitee 仓库失败:`, error);
        throw error;
    }
}
