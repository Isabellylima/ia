// D1 local (testes e demonstração) sobre node:sqlite: a mesma interface que a app usa (prepare/bind/first/all/run, batch).
import { DatabaseSync } from 'node:sqlite';

export function d1Local(caminho = ':memory:') {
  const db = new DatabaseSync(caminho);
  const instrucao = (sql, args = []) => ({
    bind: (...a) => instrucao(sql, a),
    async first(col) { const r = db.prepare(sql).get(...args); if (r == null) return null; return col ? r[col] : { ...r }; },
    async all() { return { success: true, results: db.prepare(sql).all(...args).map((r) => ({ ...r })) }; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return {
    prepare: (sql) => instrucao(sql),
    async batch(lista) {
      db.exec('BEGIN');
      try { const r = []; for (const s of lista) r.push(await s.run()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    sqlite: db,
  };
}
