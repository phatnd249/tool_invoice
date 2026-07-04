import { Request, Response } from 'express';
import { MaSoThueService } from '../services/masothue.service.js';

export class MaSoThueController {
  static async lookup(req: Request, res: Response): Promise<void> {
    try {
      const { taxCode } = req.params;
      if (!taxCode) {
        res.status(400).json({ error: 'Mã số thuế không được để trống' });
        return;
      }

      const result = await MaSoThueService.lookup(taxCode);
      res.json(result);
    } catch (error: any) {
      if (error.message.includes('Không tìm thấy')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }
}
