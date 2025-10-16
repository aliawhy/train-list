import {logTime} from "../log/LogUtils";
import path from "path";
import fs from "fs";
import {SimpleGit} from 'simple-git';

/**
 * 本文件，将git仓库当做数据库进行使用
 * 因此： 采用孤儿分支的方案，备份原分支、强制安全删除现有分支，还原工作环境，处理，上传。
 * 使得： 所有提交都不会报冲突文件
 *
 * 请必须记住原则： 每次分支提交，都使用孤儿分支上传！
 */

/**
 * 模块 1 : 备份现有分支 (优化版)
 * 如果远程分支存在，则将其内容备份到指定的临时目录。
 * 优化点：直接使用传入的 masterBranch 进行恢复，消除了内部猜测逻辑，使流程更可控。
 */
async function backupExistingBranch(
    repoGit: SimpleGit,
    tempDir: string,
    branchName: string,
    backupTempDir: string,
    masterBranch: string // <-- 新增参数，用于指定恢复时切换的基准分支
): Promise<void> {
    // 先获取最新的远程信息，确保我们的判断是基于最新状态的
    await repoGit.fetch();
    const remoteBranches = await repoGit.listRemote(['--heads', 'origin', branchName]);

    if (!remoteBranches.trim()) {
        console.log(`${logTime()} 远程分支 ${branchName} 不存在，无需备份。`);
        return;
    }

    console.log(`${logTime()} 远程分支 ${branchName} 已存在，开始备份存量文件...`);
    const tempBackupBranchName = `temp_backup_${branchName}_${Date.now()}`;
    try {
        // 1. 基于远程分支创建一个唯一的临时本地分支
        await repoGit.checkout(['-b', tempBackupBranchName, `origin/${branchName}`]);
        // 2. 此时工作区已包含远程分支的所有文件，直接复制到备份目录
        fs.mkdirSync(backupTempDir, {recursive: true});
        const items = fs.readdirSync(tempDir);
        for (const item of items) {
            if (item === '.git') continue;
            const srcPath = path.join(tempDir, item);
            const destPath = path.join(backupTempDir, item);
            fs.cpSync(srcPath, destPath, {recursive: true});
        }
        console.log(`${logTime()} 存量文件已成功备份到: ${backupTempDir}`);
    } catch (backupError) {
        console.error(`${logTime()} 备份存量文件时出错，将作为空分支处理:`, backupError);
        // 不抛出错误，允许流程继续，相当于从零开始
    } finally {
        // 4. 无论成功与否，都清理这个临时分支，保持仓库干净
        try {
            // --- 优化点 ---
            // 直接切换回传入的 masterBranch，而不是猜测的 originalBranch
            await repoGit.checkout(masterBranch);
            await repoGit.deleteLocalBranch(tempBackupBranchName, true);
            console.log(`${logTime()} 临时备份分支 ${tempBackupBranchName} 已清理。`);
        } catch (e) {
            // 如果恢复 masterBranch 也失败（比如它被删除了），再尝试创建一个孤儿分支来“垫脚”
            console.warn(`${logTime()} 无法切换回 masterBranch ('${masterBranch}')，尝试创建临时分支进行清理。`);
            try {
                await repoGit.checkout(['--orphan', 'temp_placeholder_for_cleanup']);
                await repoGit.reset(['--hard']);
                await repoGit.deleteLocalBranch(tempBackupBranchName, true);
            } catch (orphanError) {
                // 这是最后的防线，如果还失败，就记录警告，但不中断流程
                console.warn(`${logTime()} 清理临时备份分支 ${tempBackupBranchName} 失败:`, (orphanError as Error).message);
            }
        }
    }
}

/**
 * 模块 2: 删除指定的分支
 * 删除一个或多个本地和远程分支。
 */
async function deleteBranches(
    repoGit: SimpleGit,
    branchesToDelete: string[]
): Promise<void> {
    for (const fullBranchName of branchesToDelete) {
        const actualBranchName = fullBranchName.replace('remotes/origin/', '');

        // 先切换到主分支，确保可以删除当前分支
        try {
            await repoGit.checkout('main'); // 假设主分支是main，如果不是，请传入masterBranch
        } catch (e) {
            // 如果main也不存在，就创建一个空的orphan分支再切换
            try {
                await repoGit.checkout(['--orphan', 'temp_placeholder_branch']);
                await repoGit.reset(['--hard']);
            } catch (orphanError) {
                console.warn(`${logTime()} 无法切换到主分支或创建临时分支，可能处于游离状态。继续删除操作...`);
            }
        }

        try {
            await repoGit.push(['origin', '--delete', actualBranchName]);
            console.log(`${logTime()} 已删除远程分支: ${actualBranchName}`);
        } catch (e) { /* 忽略删除失败，可能分支已不存在 */
        }

        try {
            await repoGit.deleteLocalBranch(actualBranchName, true); // 使用 -D 强制删除
            console.log(`${logTime()} 已删除本地分支: ${actualBranchName}`);
        } catch (e) { /* 忽略删除失败 */
        }
    }
}

/**
 * 模块 3: 创建孤儿分支
 * 切换到主分支，然后创建并重置一个新的孤儿分支。
 */
async function createOrphanBranch(
    repoGit: SimpleGit,
    masterBranch: string,
    branchName: string
): Promise<void> {
    try {
        await repoGit.checkout(masterBranch);
    } catch (e) {
        console.warn(`${logTime()} 无法切换到${masterBranch}分支，可能不存在。继续...`);
    }
    await repoGit.checkout(['--orphan', branchName]);
    await repoGit.reset(['--hard']);
    console.log(`${logTime()} 孤儿分支 ${branchName} 已创建并重置`);
}

/**
 * 模块 4: 恢复备份文件
 * 如果备份目录存在，则将其中的所有文件恢复到仓库工作区。
 */
async function restoreBackup(
    tempDir: string,
    backupTempDir: string
): Promise<void> {
    if (!fs.existsSync(backupTempDir)) {
        console.log(`${logTime()} 备份目录不存在，跳过恢复。`);
        return;
    }

    console.log(`${logTime()} 正在从备份恢复存量文件...`);
    const items = fs.readdirSync(backupTempDir);
    for (const item of items) {
        const srcPath = path.join(backupTempDir, item);
        const destPath = path.join(tempDir, item);
        fs.cpSync(srcPath, destPath, {recursive: true});
    }
    console.log(`${logTime()} 存量文件恢复完成。`);
}

/**
 * 模块 5: 写入文件内容
 * 处理文件内容的生成（通过处理器或直接覆盖）并写入磁盘。
 */
function writeFileContent(
    tempDir: string,
    filePathInRepo: string,
    fileContent: string | Buffer,
    contentProcessor?: (oldContent: string | null) => string | Buffer
): void {
    const fullPath = path.join(tempDir, filePathInRepo);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive: true});
    }

    let finalContent: string | Buffer;
    if (contentProcessor) {
        let oldContent: string | null = null;
        if (fs.existsSync(fullPath)) {
            try {
                oldContent = fs.readFileSync(fullPath, 'utf-8');
            } catch (e) {
                console.error(`${logTime()} 读取旧文件失败，将作为空文件处理:`, e);
            }
        }
        finalContent = contentProcessor(oldContent);
        console.log(`${logTime()} 已通过 contentProcessor 生成新内容。`);
    } else {
        finalContent = fileContent;
    }

    fs.writeFileSync(fullPath, finalContent);
    console.log(`${logTime()} 新数据已写入文件: ${fullPath}`);
}

/**
 * 模块 6: 提交并推送
 * 添加所有更改，提交并推送到远程仓库。
 */
async function commitAndPush(
    repoGit: SimpleGit,
    branchName: string,
    commitMessage: string
): Promise<void> {
    await repoGit.add('.');
    const status = await repoGit.status();
    if (status.files.length > 0) {
        await repoGit.commit(commitMessage);
        await repoGit.push('origin', branchName, ['--set-upstream']);
        console.log(`${logTime()} 分支 ${branchName} 已成功推送到远程仓库`);
    } else {
        console.log(`${logTime()} 没有文件变更，跳过提交和推送。`);
    }
}


// 定义一个接口来封装所有入参
export interface SafeWriteOptions {
    /** SimpleGit 实例 */
    repoGit: SimpleGit;
    /** 仓库的临时工作目录 */
    tempDir: string;
    /** 主分支名称 (如 'main' 或 'master') */
    masterBranch: string;
    /** 要创建或更新的目标分支名称 */
    branchName: string;
    /** 是否需要备份目标分支的现有内容 */
    needBackup: boolean;
    /** 仓库中要写入的文件路径 */
    filePathInRepo: string;
    /** 要写入文件的新内容 */
    fileContent: string | Buffer;
    /** Git 提交信息 */
    commitMessage: string;
    /** 在写入前需要强制删除的分支列表 (可选) */
    branchesToDeleteBeforeWrite?: string[];
    /** 内容处理器，用于在写入前合并或处理新旧内容 (可选) */
    contentProcessor?: (oldContent: string | null) => string | Buffer;
    /** 在提交前执行的异步钩子函数 (可选) */
    beforeCommit?: () => Promise<void>;
}

/**
 * 安全地向指定分支写入文件，支持备份、重试和提交前钩子。
 * @param options - 包含所有操作参数的配置对象。
 */
export async function safeWriteToBranch(options: SafeWriteOptions): Promise<void> {
    // 从 options 对象中解构出所有需要的参数
    const {
        repoGit,
        tempDir,
        masterBranch,
        branchName,
        needBackup,
        filePathInRepo,
        fileContent,
        commitMessage,
        branchesToDeleteBeforeWrite = [],
        contentProcessor,
        beforeCommit,
    } = options;


    const maxAttempts = 3;
    let attempt = 0;
    let lastError: Error | null = null;

    const repoParentDir = path.dirname(tempDir);
    let backupTempDir: string;

    while (attempt < maxAttempts) {
        attempt++;
        // 为每次尝试创建一个唯一的备份目录
        backupTempDir = path.join(repoParentDir, `.git_backup_temp_${branchName}_${Date.now()}_${attempt}`);
        try {
            console.log(`${logTime()} [尝试${attempt}/${maxAttempts}] 开始安全写入分支:${branchName}`);

            // --- 优化后的执行流程 ---
            // 1. 首先备份存量文件（如果远程存在的话），这一步必须在删除操作之前，以确保数据不丢失
            if (needBackup) {
                console.log(`${logTime()} 需要备份，开始执行备份流程...`);
                await backupExistingBranch(repoGit, tempDir, branchName, backupTempDir, masterBranch);
            } else {
                console.log(`${logTime()} 跳过备份流程 (needBackup = false)。`);
            }

            // 2. 强制删除要求删除的分支，为后续操作扫清障碍
            await deleteBranches(repoGit, branchesToDeleteBeforeWrite);

            // 3. 创建干净的孤儿分支
            await createOrphanBranch(repoGit, masterBranch, branchName);

            // 4. 恢复备份的文件
            if (needBackup) {
                console.log(`${logTime()} 正在恢复备份的文件...`);
                await restoreBackup(tempDir, backupTempDir);
            }

            // 5. 写入新内容
            writeFileContent(tempDir, filePathInRepo, fileContent, contentProcessor);

            // 6. 执行 beforeCommit 钩子函数（如果提供）
            if (beforeCommit) {
                console.log(`${logTime()} 正在执行 beforeCommit 钩子函数...`);
                await beforeCommit();
                console.log(`${logTime()} beforeCommit 钩子函数执行完成。`);
            }

            // 7. 提交并推送
            await commitAndPush(repoGit, branchName, commitMessage);
            // --- 流程结束 ---

            return; // 成功则跳出循环

        } catch (error) {
            lastError = error as Error;
            console.error(`${logTime()} [尝试${attempt}/${maxAttempts}] 写入分支${branchName} 失败:`, lastError);
            if (attempt < maxAttempts) {
                const delay = Math.pow(2, attempt) * 1000; // 指数退避
                console.log(`${logTime()} 等待${delay / 1000} 秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        } finally {
            // 无论成功或失败，都清理本次尝试产生的临时备份目录
            if (fs.existsSync(backupTempDir)) {
                try {
                    fs.rmSync(backupTempDir, {recursive: true, force: true});
                    console.log(`${logTime()} [尝试${attempt}] 临时备份目录 ${backupTempDir} 已清理。`);
                } catch (cleanupError) {
                    console.error(`${logTime()} [尝试${attempt}] 清理临时备份目录失败:`, cleanupError);
                }
            }
        }
    }

    throw new Error(`写入分支 ${branchName} 失败，已达到最大重试次数${maxAttempts}。最后一个错误: ${lastError?.message}`);
}
