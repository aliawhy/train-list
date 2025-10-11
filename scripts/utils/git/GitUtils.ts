import {logTime} from "../log/LogUtils";
import path from "path";
import fs from "fs";
import {SimpleGit, simpleGit} from 'simple-git';
import * as os from 'os';

/**
 * 推送文件到指定仓库的分支
 * @param repoUrl 仓库URL
 * @param initCloneBranch 下载仓库时，基于哪个分支下载
 * @param branchName 目标分支名
 * @param filePath 文件路径（基于仓库根目录的相对路径）
 * @param fileContent 文件内容（支持中文）
 */
async function pushToRepoBranch(repoUrl: string, initCloneBranch: string, branchName: string, filePath: string, fileContent: string) {
    try {
        console.debug(`${logTime()} 开始推送到仓库分支 ${branchName}`);

        // 创建临时目录
        const tempDir = path.join(os.tmpdir(), `temp-repo-${Date.now()}`);

        // 如果临时目录已存在，先删除
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, {recursive: true, force: true});
        }

        // 克隆仓库的main分支
        const git = simpleGit();
        await git.clone(repoUrl, tempDir, ['--branch', initCloneBranch, '--single-branch']);
        console.debug(`${logTime()} 仓库main分支克隆完成`);

        // 切换到克隆的仓库目录
        const repoGit = simpleGit(tempDir);

        // 创建并切换到新分支
        await repoGit.checkoutLocalBranch(branchName);
        console.debug(`${logTime()} 已创建并切换到分支 ${branchName}`);

        // 确保目标目录存在
        const targetDir = path.join(tempDir, path.dirname(filePath));
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, {recursive: true});
        }

        // 写入文件内容
        const targetFilePath = path.join(tempDir, filePath);
        fs.writeFileSync(targetFilePath, fileContent, 'utf8');
        console.debug(`${logTime()} 文件已写入 ${filePath}`);

        // 配置Git用户信息
        await repoGit.addConfig('user.name', 'action@github');
        await repoGit.addConfig('user.email', 'action@github');

        // 添加、提交并推送
        await repoGit.add(filePath);
        await repoGit.commit(`添加/更新 ${filePath}`);

        // 推送到指定分支
        await repoGit.push('origin', branchName);
        console.debug(`${logTime()} 文件已成功推送到分支 ${branchName}`);

        // 清理临时目录
        fs.rmSync(tempDir, {recursive: true, force: true});
        console.debug(`${logTime()} 临时目录已清理`);
    } catch (error) {
        console.error(`${logTime()} 推送到仓库分支失败:`, error);
        throw error;
    }
}