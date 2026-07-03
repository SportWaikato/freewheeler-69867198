// Typed escape hatch for game tables that aren't in the generated Supabase
// types yet (game_rides / game_race_rooms / game_race_results predate a types
// regen). Keeps `any` out of call sites; delete once types are regenerated.
import { supabase } from '@/integrations/supabase/client';

interface DbError { message: string }

interface TableOps {
  insert: (row: Record<string, unknown>) => PromiseLike<{ error: DbError | null }>;
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: string) => PromiseLike<{ error: DbError | null }>;
  };
}

function table(name: string): TableOps {
  return (supabase.from as unknown as (t: string) => TableOps)(name);
}

export function insertRow(name: string, row: Record<string, unknown>) {
  return table(name).insert(row);
}

export function updateRowsWhere(
  name: string,
  values: Record<string, unknown>,
  column: string,
  value: string,
) {
  return table(name).update(values).eq(column, value);
}
