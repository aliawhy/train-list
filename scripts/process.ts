import * as fs from 'fs';
import * as path from 'path';

// 获取北京时间
function getBeijingTime(): { date: string; time: string } {
  const now = new Date();
  // 转换为北京时间 (UTC+8)
  const beijingTime = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  
  // 格式化为年月日
  const date = beijingTime.toISOString().replace(/[-T:]/g, '').slice(0, 8);
  // 格式化为年月日时分秒
  const time = beijingTime.toISOString().replace(/[-T:]/g, '').slice(0, 14);
  
  return { date, time };
}

// 创建JSON文件
function createJsonFile() {
  const { date, time } = getBeijingTime();
  
  // 确保目录存在
  const dirPath = path.join(__dirname, '..', 'data', date);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  // 创建文件路径
  const filePath = path.join(dirPath, `test-${time}.json`);
  
  // JSON内容
  const content = {
    createdAt: time,
    timezone: "Asia/Shanghai",
    message: "This is a test file created by GitHub Action"
  };
  
  // 写入文件
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  console.log(`Created file: ${filePath}`);
  
  return { date, filePath };
}

// 如果直接运行此脚本
if (require.main === module) {
  createJsonFile();
}

export { createJsonFile, getBeijingTime };
