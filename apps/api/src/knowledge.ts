import { fetchBundle, KnowledgeRegistry, type KnowledgeBundle, type KnowledgeSource } from "@coach/knowledge";
import { eq } from "drizzle-orm";
import { schema, type Db } from "./db/index.js";

/**
 * Restore the last active bundle from the DB, then try to install the latest
 * one from the source. A failed fetch or a bundle that fails validation leaves
 * the previous active version in place.
 */
export async function bootKnowledge(db: Db, source: KnowledgeSource): Promise<KnowledgeRegistry> {
  const registry = new KnowledgeRegistry();
  const [active] = await db.select().from(schema.knowledgeBundles).where(eq(schema.knowledgeBundles.status, "active"));
  if (active) registry.install(active.payload as KnowledgeBundle);

  try {
    const bundle = await fetchBundle(source);
    if (bundle.version !== registry.active()?.version) {
      const result = registry.install(bundle);
      if (result.ok && active) {
        await db.update(schema.knowledgeBundles).set({ status: "retired" }).where(eq(schema.knowledgeBundles.version, active.version));
      }
      await db
        .insert(schema.knowledgeBundles)
        .values({ version: bundle.version, source: bundle.source, status: result.ok ? "active" : "rejected", errors: result.errors, payload: bundle })
        .onConflictDoUpdate({
          target: schema.knowledgeBundles.version,
          set: { status: result.ok ? "active" : "rejected", errors: result.errors, payload: bundle },
        });
    }
  } catch (err) {
    console.warn(`[knowledge] could not refresh static data: ${err instanceof Error ? err.message : String(err)}`);
  }
  return registry;
}
