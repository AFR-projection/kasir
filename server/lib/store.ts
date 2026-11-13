import { pool } from "../db/pool";
import type { StoreDto, StoreRow } from "./serializers";
import { mapStore } from "./serializers";

export async function getStore(client: Pick<typeof pool, "query"> = pool): Promise<StoreDto> {
  const result = await client.query<StoreRow>(
    `SELECT store_name, store_address, store_phone, receipt_footer
     FROM store_settings WHERE id = 1`,
  );
  if (!result.rows[0]) {
    return {
      storeName: "Toko Saya",
      storeAddress: null,
      storePhone: null,
      receiptFooter: "Terima kasih telah berbelanja.",
    };
  }
  return mapStore(result.rows[0]);
}
