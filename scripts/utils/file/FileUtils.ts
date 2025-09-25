import {encode as msgpackEncoder} from 'msgpack-lite';
import pako from 'pako';
import {logTime} from "../log/LogUtils";
import path from "path";
import fs from "fs";
import {getBeijingDateTime} from "../date/DateUtil";
import {TrainDetailMap} from "../../processGDCJ";
import {simpleGit} from 'simple-git';
import {compress} from '@mongodb-js/zstd';

export interface BaseVersionFile {
    _version: string;
    _fileName: string;
}


/**
 * 压缩和编码，然后保存
 * 每天一个文件
 * /data/GDCJ/gdcj-YYYY-MM-DD.msgpack.gz（每天一个文件）
 */
export async function encodeAndSave(__dirname, result: TrainDetailMap) {

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
        await git.clone(process.env.GITEE_URL, tempDir);
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
