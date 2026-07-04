import { MaSoThueService } from './masothue.service.js';

async function run() {
  try {
    const res = await MaSoThueService.lookup('3600674207');
    console.log(res);
  } catch (err: any) {
    console.error('ERROR:', err.message);
  }
}
run();
