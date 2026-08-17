CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS embeddings_api_key text;

CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title       text NOT NULL,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_knowledge_documents_account_id_idx
  ON ai_knowledge_documents (account_id);

ALTER TABLE ai_knowledge_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_knowledge_documents_select ON ai_knowledge_documents;
CREATE POLICY ai_knowledge_documents_select ON ai_knowledge_documents FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS ai_knowledge_documents_insert ON ai_knowledge_documents;
CREATE POLICY ai_knowledge_documents_insert ON ai_knowledge_documents FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_knowledge_documents_update ON ai_knowledge_documents;
CREATE POLICY ai_knowledge_documents_update ON ai_knowledge_documents FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_knowledge_documents_delete ON ai_knowledge_documents;
CREATE POLICY ai_knowledge_documents_delete ON ai_knowledge_documents FOR DELETE
  USING (is_account_member(account_id, 'admin'));

CREATE OR REPLACE FUNCTION public.update_ai_knowledge_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_knowledge_documents_updated_at ON ai_knowledge_documents;
CREATE TRIGGER ai_knowledge_documents_updated_at
  BEFORE UPDATE ON ai_knowledge_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_knowledge_documents_updated_at();

CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  chunk_index  integer NOT NULL DEFAULT 0,
  content      text NOT NULL,
  fts          tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  embedding    extensions.vector(1536),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_account_id_idx
  ON ai_knowledge_chunks (account_id);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_document_id_idx
  ON ai_knowledge_chunks (document_id);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_fts_idx
  ON ai_knowledge_chunks USING gin (fts);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_embedding_idx
  ON ai_knowledge_chunks USING hnsw (embedding extensions.vector_cosine_ops);

ALTER TABLE ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_knowledge_chunks_select ON ai_knowledge_chunks;
CREATE POLICY ai_knowledge_chunks_select ON ai_knowledge_chunks FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS ai_knowledge_chunks_insert ON ai_knowledge_chunks;
CREATE POLICY ai_knowledge_chunks_insert ON ai_knowledge_chunks FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_knowledge_chunks_update ON ai_knowledge_chunks;
CREATE POLICY ai_knowledge_chunks_update ON ai_knowledge_chunks FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_knowledge_chunks_delete ON ai_knowledge_chunks;
CREATE POLICY ai_knowledge_chunks_delete ON ai_knowledge_chunks FOR DELETE
  USING (is_account_member(account_id, 'admin'));

CREATE OR REPLACE FUNCTION public.match_ai_knowledge_fts(
  p_account_id  uuid,
  p_query       text,
  p_match_count integer
)
RETURNS TABLE (id uuid, content text, rank real) AS $$
  SELECT c.id,
         c.content,
         ts_rank(c.fts, plainto_tsquery('simple', p_query)) AS rank
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND c.fts @@ plainto_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT GREATEST(p_match_count, 0);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.match_ai_knowledge_semantic(
  p_account_id      uuid,
  p_query_embedding text,
  p_match_count     integer
)
RETURNS TABLE (id uuid, content text, distance real) AS $$
  SELECT c.id,
         c.content,
         (c.embedding <=> p_query_embedding::extensions.vector(1536)) AS distance
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding::extensions.vector(1536)
  LIMIT GREATEST(p_match_count, 0);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions;

REVOKE ALL ON FUNCTION public.match_ai_knowledge_fts(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_fts(uuid, text, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.match_ai_knowledge_semantic(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_semantic(uuid, text, integer) TO authenticated, service_role;y