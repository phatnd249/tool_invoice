import axios from 'axios';

async function run() {
  const headers = {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/114.0.0.0 Safari/537.36"
  };

  const tokenRes = await axios.post('https://masothue.com/Ajax/Token', '', { headers });
  const cookies = tokenRes.headers['set-cookie'];
  const token = tokenRes.data.token;
  console.log('Token:', token);
  console.log('Cookies:', cookies);

  const searchHeaders = {
    ...headers,
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "x-requested-with": "XMLHttpRequest",
    "Referer": "https://masothue.com/"
  };
  if (cookies) {
    searchHeaders['cookie'] = 'res=1920x1200; hm=1; ' + cookies.map(c => c.split(';')[0]).join('; ');
  }

  const searchRes = await axios.post(
    'https://masothue.com/Ajax/Search',
    `q=3600448014&type=enterpriseTax&token=${token}`,
    { headers: searchHeaders }
  );
  
  console.log('Search Data:', searchRes.data);
}
run();
