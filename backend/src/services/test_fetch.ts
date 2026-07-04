async function run() {
  const tokenRes = await fetch("https://masothue.com/Ajax/Token", {
    "headers": {
      "accept": "application/json, text/javascript, */*; q=0.01",
      "accept-language": "en-US,en;q=0.9",
    },
    "method": "POST"
  });
  
  const tokenData = await tokenRes.json();
  const token = tokenData.token;
  
  const setCookieHeader = tokenRes.headers.get('set-cookie');
  let phpsessid = '';
  if (setCookieHeader) {
    const match = setCookieHeader.match(/PHPSESSID=([^;]+)/);
    if (match) phpsessid = match[1];
  }
  console.log('phpsessid:', phpsessid);

  const searchRes = await fetch("https://masothue.com/Ajax/Search", {
    "headers": {
      "accept": "application/json, text/javascript, */*; q=0.01",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "priority": "u=1, i",
      "sec-ch-ua": "\"Google Chrome\";v=\"149\", \"Chromium\";v=\"149\", \"Not)A;Brand\";v=\"24\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-requested-with": "XMLHttpRequest",
      "cookie": `res=1920x1200; hm=1; c_code_name=VN; PHPSESSID=${phpsessid}`,
      "Referer": "https://masothue.com/",
      "Origin": "https://masothue.com",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
    },
    "body": `q=3600448014&type=enterpriseTax&token=${token}`,
    "method": "POST"
  });
  
  console.log(await searchRes.json());
}
run();
