import {encode as msgpackEncoder} from 'msgpack-lite';
import pako from 'pako';
import {logTime} from "../log/LogUtils";
import path from "path";
import fs from "fs";
import {getBeijingDateTime} from "../date/DateUtil";
import {isTest, TrainDetailMap} from "../../processGDCJ";
import {simpleGit, SimpleGit, CheckRepoActions} from 'simple-git';
import {compress} from '@mongodb-js/zstd';
import {APP_NAME, BASE_GITEE_DOWNLOAD_RAW_URL} from "../app-env/app-env-url";

export interface BaseVersionFile {
    _version: string;
    _fileName: string;
    _dataUrl: string;
}

/**
 * 将 TrainDetailMap 编码、压缩、保存到本地并推送到 Gitee 仓库。
 * @param __dirname 当前脚本目录
 * @param result 最终要保存的 TrainDetailMap
 */
export async function encodeAndSave(__dirname: string, result: TrainDetailMap) {
    if (isTest) {
        console.debug(`测试模式下，数据不推送到 Gitee，流程结束。`);
        return;
    }

    const baseDir = path.join(__dirname, '..'); // 项目根目录

    const versionString = getBeijingDateTime();
    const dataFileName = `${APP_NAME}-gdcj-train-detail.${versionString}.msgpack.zst`;
    const versionFileName = `${APP_NAME}-gdcj-train-detail.version.json`;

    // 使用msgpack编码
    const msgpackBuffer = msgpackEncoder(result);
    console.debug(`${logTime()} 数据保存：pack编码完毕`);

    let compressedData;
    if (false) {
        compressedData = pako.gzip(msgpackBuffer); // gz版本
    } else {
        compressedData = await compress(msgpackBuffer, 19); // zstd
    }
    console.debug(`${logTime()} 数据保存：压缩完毕`);

    // 准备版本文件内容
    const versionData: BaseVersionFile = {
        _version: versionString,
        _fileName: dataFileName,
        _dataUrl: `${BASE_GITEE_DOWNLOAD_RAW_URL}/data_${APP_NAME}-gdcj-train-detail/data/${dataFileName}`
    };

    const repoUrl = process.env.MY_GITHUB_MINI_DATA_DOWNLOADER_URL;
    if (!repoUrl) {
        throw new Error("MY_GITHUB_MINI_DATA_DOWNLOADER_URL 环境变量未设置");
    }

    try {
        // 步骤 1: 推送数据文件
        console.debug(`${logTime()} 开始处理数据文件推送...`);
        await pushDataFile(repoUrl, baseDir, compressedData, dataFileName);
        console.log(`${logTime()} 数据文件推送成功！`);

        // 步骤 2: 推送版本文件 (在数据文件成功后执行)
        console.debug(`${logTime()} 开始处理版本文件推送...`);
        await pushVersionFile(repoUrl, baseDir, JSON.stringify(versionData), versionFileName);
        console.log(`${logTime()} 版本文件推送成功！`);

        console.log(`${logTime()} 所有文件已成功推送到 Gitee 仓库。`);

    } catch (error) {
        console.error(`${logTime()} 推送到 Gitee 仓库失败:`, error);
        throw error;
    }
}


/**
 * 安全地创建和清理临时目录的辅助函数
 * @param baseDir 基础目录
 * @param tempDirName 临时目录名
 * @param callback 在临时目录中执行的回调函数
 */
async function withTempDir(baseDir: string, tempDirName: string, callback: (tempPath: string) => Promise<void>): Promise<void> {
    const tempDir = path.join(baseDir, tempDirName);
    try {
        // 如果临时目录已存在，先删除
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, {recursive: true, force: true});
        }
        // 创建临时目录
        fs.mkdirSync(tempDir, {recursive: true});
        console.debug(`${logTime()} 临时目录已创建: ${tempDir}`);

        await callback(tempDir);
    } finally {
        // 清理临时目录
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, {recursive: true, force: true});
            console.debug(`${logTime()} 临时目录已清理: ${tempDir}`);
        }
    }
}

/**
 * 确保远程分支存在，如果不存在则创建它，然后克隆到本地。
 * @param repoUrl 仓库 URL
 * @param tempDir 本地临时目录路径
 * @param branchName 要确保存在的分支名
 */
async function ensureBranchAndClone(repoUrl: string, tempDir: string, branchName: string): Promise<void> {
    const git: SimpleGit = simpleGit();
    try {
        // 尝试直接克隆指定分支
        console.debug(`${logTime()} 尝试克隆 ${branchName} 分支...`);
        await git.clone(repoUrl, tempDir, ['--branch', branchName, '--single-branch']);
        console.debug(`${logTime()} 分支 ${branchName} 已存在，克隆成功。`);
    } catch (error: any) {
        // 如果克隆失败，可能是因为分支不存在
        if (error.message.includes('Remote branch') && error.message.includes('not found')) {
            console.warn(`${logTime()} 远程分支 ${branchName} 不存在，将尝试创建它。`);
            // 1. 克隆默认分支
            await git.clone(repoUrl, tempDir);
            console.debug(`${logTime()} 默认分支克隆成功。`);

            const repoGit: SimpleGit = simpleGit(tempDir);
            // 2. 创建并切换到新分支
            await repoGit.checkoutLocalBranch(branchName);
            console.debug(`${logTime()} 本地分支 ${branchName} 已创建。`);

            // 3. 配置用户信息（首次推送需要）
            await repoGit.addConfig('user.name', 'action@github');
            await repoGit.addConfig('user.email', 'action@github');

            // 4. 推送新分支到远程，完成创建
            // 使用 --set-upstream 将本地分支与远程分支关联
            await repoGit.push('origin', branchName, ['--set-upstream']);
            console.log(`${logTime()} 远程分支 ${branchName} 创建成功。`);
        } else {
            // 如果是其他错误，直接抛出
            throw error;
        }
    }
}


/**
 * 推送数据文件到 Gitee 仓库的 data 分支
 * @param repoUrl 仓库 URL
 * @param baseDir 基础目录
 * @param dataBuffer 要写入的数据 Buffer
 * @param dataFileName 数据文件名
 */
async function pushDataFile(repoUrl: string, baseDir: string, dataBuffer: Buffer, dataFileName: string) {
    const branchName = `data_${APP_NAME}-gdcj-train-detail`;
    const targetRepoPath = `data/${dataFileName}`;

    await withTempDir(baseDir, 'temp-repo-data', async (tempDir) => {
        // 使用新的辅助函数来确保分支存在并完成克隆
        await ensureBranchAndClone(repoUrl, tempDir, branchName);

        const repoGit: SimpleGit = simpleGit(tempDir);
        const targetDir = path.join(tempDir, 'data');
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, {recursive: true});
        }

        const targetFilePath = path.join(targetDir, dataFileName);
        fs.writeFileSync(targetFilePath, dataBuffer);
        console.debug(`${logTime()} [Data] 文件已复制到仓库目录: ${targetFilePath}`);

        // 如果分支是新创建的，用户信息已经配置过，但再次配置也无妨
        await repoGit.addConfig('user.name', 'action@github');
        await repoGit.addConfig('user.email', 'action@github');

        await repoGit.add(targetRepoPath);
        // 检查是否有变更再提交，避免空提交
        const status = await repoGit.status();
        if (!status.isClean()) {
            await repoGit.commit(`添加数据文件 ${dataFileName}`);
            await repoGit.push('origin', branchName);
            console.debug(`${logTime()} [Data] 文件已成功推送到 ${branchName} 分支`);
        } else {
            console.debug(`${logTime()} [Data] 没有变更，跳过提交和推送。`);
        }
    });
}

/**
 * 推送版本文件到 Gitee 仓库的 version 分支
 * @param repoUrl 仓库 URL
 * @param baseDir 基础目录
 * @param versionContent 版本文件的字符串内容
 * @param versionFileName 版本文件名
 */
async function pushVersionFile(repoUrl: string, baseDir: string, versionContent: string, versionFileName: string) {
    const branchName = `version_${APP_NAME}-gdcj-train-detail`;
    const targetRepoPath = `version/${versionFileName}`;

    await withTempDir(baseDir, 'temp-repo-version', async (tempDir) => {
        // 使用新的辅助函数来确保分支存在并完成克隆
        await ensureBranchAndClone(repoUrl, tempDir, branchName);

        const repoGit: SimpleGit = simpleGit(tempDir);
        const targetDir = path.join(tempDir, 'version');
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, {recursive: true});
        }

        const targetFilePath = path.join(targetDir, versionFileName);
        fs.writeFileSync(targetFilePath, versionContent);
        console.debug(`${logTime()} [Version] 文件已复制到仓库目录: ${targetFilePath}`);

        await repoGit.addConfig('user.name', 'action@github');
        await repoGit.addConfig('user.email', 'action@github');

        await repoGit.add(targetRepoPath);
        // 检查是否有变更再提交
        const status = await repoGit.status();
        if (!status.isClean()) {
            await repoGit.commit(`更新版本文件 ${versionFileName}`);
            await repoGit.push('origin', branchName);
            console.debug(`${logTime()} [Version] 文件已成功推送到 ${branchName} 分支`);
        } else {
            console.debug(`${logTime()} [Version] 没有变更，跳过提交和推送。`);
        }
    });
}
