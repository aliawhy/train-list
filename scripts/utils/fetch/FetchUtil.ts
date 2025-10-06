import fetch from 'node-fetch';

export class FetchUtil {
    static async fetch(url: string, json: boolean = true): Promise<any> {
        console.debug(`Fetching train data from ${url}`);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Authorization': 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJsb2dpblRpbWUiOiIxNzU5MDgxNzk5MzIxIiwidXNlcm5hbWUiOiJvYm1hZjY5b3J1cmxuLXJ0N3B1enJnZHBpcy1hIn0.AUQ64DX3VSg4BITX3P54xLzpB7Q7jGVwJX0VIUBVM0E',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Dest': 'empty',
                    'Referer': 'https://gdcj.gzmtr.com/wxMetro/yyskb/schedule.html',
                    'Accept-Language': 'zh-CN,zh;q=0.9'
                }
            });


            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const responseText = await response.text();

            try {
                if (json) {
                    return JSON.parse(responseText);
                } else {
                    return responseText
                }
            } catch (e) {
                throw new Error('Failed to parse JSON response');
            }
        } catch (error) {
            console.error('Error fetching train data:', error);
            throw error;
        }
    }
}
