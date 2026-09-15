/**
 * store-hangul-query.test.ts - Q1: Korean particle stripping for plain lex terms.
 *
 * Plain Hangul terms become `(stem phrase OR original phrase)` so `검색을` finds
 * documents that only contain `검색`. Quoted phrases stay exact, and Han/kana
 * queries keep the upstream character-phrase path.
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, type QMDStore } from "../src/index.js";
import { hangulTermQuery, stripHangulParticle } from "../src/hangul.js";

describe("hangulTermQuery", () => {
  test("strips a trailing particle into stem OR original phrase", () => {
    expect(hangulTermQuery("검색을")).toBe('("검 색" OR "검 색 을")');
    expect(hangulTermQuery("문서에서")).toBe('("문 서" OR "문 서 에 서")');
    expect(hangulTermQuery("역색인으로")).toBe('("역 색 인" OR "역 색 인 으 로")');
    expect(hangulTermQuery("나누기")).toBe('("나 누" OR "나 누 기")');
  });

  test("keeps words whose stem would drop below two syllables", () => {
    expect(stripHangulParticle("책을")).toBeNull();
    expect(stripHangulParticle("사이")).toBeNull();
    expect(stripHangulParticle("크기")).toBeNull();
    expect(hangulTermQuery("검색")).toBeNull();
  });

  test("ignores Han, kana and mixed-script terms", () => {
    expect(hangulTermQuery("中文检索")).toBeNull();
    expect(hangulTermQuery("検索を")).toBeNull();
    expect(hangulTermQuery("wiki로")).toBeNull();
  });
});

describe("searchLex with Hangul particles", () => {
  let root: string;
  let store: QMDStore;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "qmd-hangul-query-"));
    const docs = join(root, "docs");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "ko.md"), "# 검색 품질\n\n역색인 구조를 설명한다.\n");
    await writeFile(join(docs, "zh.md"), "# 中文检索说明\n\n关键词检索。\n");
    await writeFile(join(docs, "ja.md"), "# 日本語検索メモ\n\n検索品質について。\n");
    store = await createStore({
      dbPath: join(root, "index.sqlite"),
      config: { collections: { docs: { path: docs, pattern: "**/*.md" } } },
    });
    await store.update();
  });

  afterAll(async () => {
    await store.close();
    await rm(root, { recursive: true, force: true });
  });

  const files = async (query: string) => (await store.searchLex(query)).map(r => r.filepath);

  test("particle-suffixed terms match the stem", async () => {
    expect(await files("검색을")).toEqual([expect.stringContaining("ko.md")]);
    expect(await files("역색인의 구조를")).toEqual([expect.stringContaining("ko.md")]);
  });

  test("quoted phrases stay exact", async () => {
    expect(await files('"검색을"')).toEqual([]);
    expect(await files('"검색 품질"')).toEqual([expect.stringContaining("ko.md")]);
  });

  test("Han and kana queries are unchanged", async () => {
    expect(await files("关键词检索")).toEqual([expect.stringContaining("zh.md")]);
    expect(await files("検索品質")).toEqual([expect.stringContaining("ja.md")]);
  });
});
