import fetch from 'node-fetch';

// 定义自定义错误类型，用于区分超时错误
class FetchTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FetchTimeoutError';
    }
}

// 定义请求配置接口
interface FetchConfig {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers?: Record<string, string>;
    body?: string | FormData | URLSearchParams;
    json?: boolean;
    timeout?: number;
    maxRetries?: number;
}

// 定义请求选项接口（向后兼容）
interface RequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string | FormData | URLSearchParams;
}

export class FetchUtil {
    /**
     * 获取 URL 数据，带有超时和重试机制
     * @param config 请求配置对象
     * @returns Promise<any> 解析后的 JSON 对象或原始文本
     */
    static async fetch(config: FetchConfig | string): Promise<any> {
        // 兼容字符串形式的 URL 参数
        const options: FetchConfig = typeof config === 'string'
            ? { url: config }
            : config;

        // 设置默认值
        const {
            url,
            method = 'GET',
            headers = {},
            body,
            json = true,
            timeout = 3000,
            maxRetries = 1
        } = options;

        // console.debug(`正在从 ${url} 获取数据，超时时间 ${timeout}ms，请求方法 ${method}`);

        let lastError: Error | null = null;

        // 使用 for 循环来控制重试
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (attempt > 0) {
                console.warn(`首次请求失败，正在重试... (第 ${attempt + 1} 次尝试)`);
            }

            try {
                // 创建一个超时 Promise
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => {
                        reject(new FetchTimeoutError(`请求在 ${timeout}ms 后超时`));
                    }, timeout);
                });

                // 准备 fetch 请求参数
                const fetchOptions: RequestOptions = {
                    method,
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        ...headers
                    }
                };

                // 只有非 GET 请求才添加 body
                if (method !== 'GET' && body) {
                    fetchOptions.body = body;
                }

                // 创建 fetch Promise
                const fetchPromise = fetch(url, fetchOptions);

                // 使用 Promise.race 让 fetch 和超时竞争
                const response = await Promise.race([fetchPromise, timeoutPromise]);

                // 如果能执行到这里，说明 fetch 在超时前成功了
                if (!response.ok) {
                    // HTTP 状态码错误 (如 404, 500)，这种错误不应该重试
                    throw new Error(`HTTP 错误！状态码: ${response.status}`);
                }

                const responseText = await response.text();

                try {
                    return json ? JSON.parse(responseText) : responseText;
                } catch (e) {
                    // JSON 解析错误，也不应该重试
                    throw new Error('JSON 响应解析失败');
                }

            } catch (error: any) {
                lastError = error;
                console.error(`第 ${attempt + 1} 次尝试失败:`, error.message);

                // 判断是否应该重试
                // 如果是最后一次尝试，或者错误不是网络/超时错误，则直接抛出
                if (attempt === maxRetries ||
                    !(error instanceof FetchTimeoutError ||
                        error.code === 'ECONNRESET' ||
                        error.code === 'ENOTFOUND' ||
                        error.code === 'ETIMEDOUT')) {
                    throw lastError;
                }

                // 如果是可重试的错误，则继续下一次循环
            }
        }

        // 理论上不会执行到这里，因为所有错误都会在循环内被抛出
        // 但为了类型安全，可以保留一个兜底的 throw
        if (lastError) {
            throw lastError;
        }
        throw new Error('请求过程中发生未知错误');
    }

    /**
     * GET 请求的便捷方法
     * @param url 请求 URL
     * @param options 可选配置
     */
    static async get(url: string, options: Partial<FetchConfig> = {}): Promise<any> {
        return this.fetch({
            url,
            method: 'GET',
            ...options
        });
    }

    /**
     * POST 请求的便捷方法
     * @param url 请求 URL
     * @param body 请求体
     * @param options 可选配置
     */
    static async post(url: string, body?: string | FormData | URLSearchParams, options: Partial<FetchConfig> = {}): Promise<any> {
        return this.fetch({
            url,
            method: 'POST',
            body,
            ...options
        });
    }
}
