// =====================================================================
//  DESPENSA ONLINE — "Robô" de IA (Supabase Edge Function chamada "ia")
//  Guarda a chave da Anthropic em segredo (nunca vai para o celular).
//  Ações:  cardapio | receita | ler_imagem | ler_texto | ler_nfce
//  Segredo necessário: ANTHROPIC_API_KEY
// =====================================================================
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODELO = "claude-opus-5-5";
const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------------------------------------------------------------------
//  Formatos de resposta (a IA é obrigada a responder exatamente assim)
// ---------------------------------------------------------------------
const CATEGORIAS = ["Grãos e massas", "Carnes e ovos", "Laticínios", "Hortifruti", "Temperos e molhos",
  "Enlatados e conservas", "Padaria e matinais", "Bebidas", "Congelados", "Doces e lanches", "Limpeza", "Outros"];

const SCHEMA_ITENS = {
  type: "object",
  additionalProperties: false,
  required: ["itens", "observacao"],
  properties: {
    observacao: { type: "string" },
    itens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nome", "quantidade", "unidade", "categoria", "local"],
        properties: {
          nome: { type: "string" },
          quantidade: { type: "number" },
          unidade: { type: "string", enum: ["un", "kg", "g", "L", "ml", "pct", "cx", "lata", "dz"] },
          categoria: { type: "string", enum: CATEGORIAS },
          local: { type: "string", enum: ["despensa", "geladeira", "freezer"] },
        },
      },
    },
  },
};

const SCHEMA_CARDAPIO = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "dias", "compras_sugeridas"],
  properties: {
    resumo: { type: "string" },
    dias: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["data", "refeicoes"],
        properties: {
          data: { type: "string" },
          refeicoes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["tipo", "nome", "descricao", "tempo_min", "dificuldade", "equipamentos",
                "kcal_porcao", "porcoes", "ingredientes"],
              properties: {
                tipo: { type: "string" },
                nome: { type: "string" },
                descricao: { type: "string" },
                tempo_min: { type: "integer" },
                dificuldade: { type: "string", enum: ["fácil", "média", "difícil"] },
                equipamentos: { type: "array", items: { type: "string" } },
                kcal_porcao: { type: "integer" },
                porcoes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["pessoa", "quantidade", "kcal"],
                    properties: { pessoa: { type: "string" }, quantidade: { type: "string" }, kcal: { type: "integer" } },
                  },
                },
                ingredientes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["nome", "quantidade", "unidade", "item"],
                    properties: {
                      nome: { type: "string" },
                      quantidade: { type: "number" },
                      unidade: { type: "string" },
                      item: { type: "integer" }, // número do item da despensa, ou 0 se não tem em casa
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    compras_sugeridas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nome", "quantidade", "unidade"],
        properties: { nome: { type: "string" }, quantidade: { type: "number" }, unidade: { type: "string" } },
      },
    },
  },
};

const SCHEMA_RECEITA = {
  type: "object",
  additionalProperties: false,
  required: ["modo_preparo", "dica"],
  properties: { modo_preparo: { type: "array", items: { type: "string" } }, dica: { type: "string" } },
};

// ---------------------------------------------------------------------
//  Chamada à IA com resposta em JSON
// ---------------------------------------------------------------------
async function perguntar(opts: {
  system: string;
  conteudo: Anthropic.Beta.BetaContentBlockParam[];
  schema: Record<string, unknown>;
  esforco: "low" | "medium" | "high";
  maxTokens: number;
}) {
  const msg = await anthropic.beta.messages
    .stream({
      model: MODELO,
      max_tokens: opts.maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.esforco, format: { type: "json_schema", schema: opts.schema } },
      system: opts.system,
      messages: [{ role: "user", content: opts.conteudo }],
    })
    .finalMessage();

  if (msg.stop_reason === "refusal") throw new Error("A IA não conseguiu atender esse pedido. Tente de outro jeito.");
  if (msg.stop_reason === "max_tokens") throw new Error("A resposta ficou grande demais. Tente com menos dias.");
  const texto = msg.content.find((b) => b.type === "text");
  if (!texto || texto.type !== "text") throw new Error("A IA não devolveu resposta.");
  return JSON.parse(texto.text);
}

const SYSTEM_LEITOR = `Você lê compras de supermercado brasileiras (cupons fiscais, NFC-e, listas escritas à mão ou digitadas) e devolve os itens de comida/casa para cadastrar numa despensa.
- Traduza abreviações de cupom para nomes simples e comuns em português (ex.: "ARR TP1 TIO J 5KG" → "Arroz tipo 1", 5 kg; "LTE UHT INT 1L" → "Leite integral", 1 L).
- Quantidade: se o cupom traz "2 UN x" de um pacote de 5 kg, use quantidade 10 e unidade kg. Para itens vendidos por peso, use kg. Se não souber, use 1 un.
- Junte itens repetidos. Ignore linhas que não são produtos (totais, impostos, pagamento, CPF, descontos).
- local: carnes cruas e congelados → freezer; laticínios, frios, hortifruti perecível, ovos → geladeira; o resto → despensa.
- Em "observacao" escreva algo curto apenas se algo ficou ilegível ou duvidoso; senão deixe vazio.`;

// ---------------------------------------------------------------------
//  Ações
// ---------------------------------------------------------------------
async function acaoCardapio(b: any) {
  const ctx = b.contexto;
  const listaItens = (ctx.itens as any[])
    .map((it, i) => `#${i + 1} ${it.nome} — ${it.quantidade} ${it.unidade}${it.validade ? ` (vence ${it.validade})` : ""}`)
    .join("\n");
  const pessoas = (ctx.pessoas as any[])
    .map((p) => `- ${p.nome}: ${p.descricao}. Meta diária ≈ ${p.kcal} kcal.` +
      (p.gosta ? ` Gosta: ${p.gosta}.` : "") + (p.nao_gosta ? ` NÃO gosta: ${p.nao_gosta}.` : "") +
      (p.restricoes ? ` RESTRIÇÕES (obrigatório respeitar): ${p.restricoes}.` : ""))
    .join("\n");

  const system = `Você é um nutricionista e cozinheiro brasileiro que planeja o cardápio da semana de uma família, priorizando o que ela já tem na despensa.
Regras:
- Use primeiro o que está em casa, principalmente o que vence antes. Evite desperdício.
- Respeite SEMPRE as restrições e alergias. Evite o que alguém não gosta; favoreça o que gostam.
- Use só os equipamentos disponíveis. Respeite o tempo máximo de preparo informado.
- Comida caseira brasileira, variada, sem repetir o mesmo prato na semana (sobras planejadas são bem-vindas, ex.: frango do almoço vira recheio no jantar seguinte — diga isso na descrição).
- "porcoes": uma linha por pessoa, com a quantidade em medida caseira (ex.: "4 col. sopa de arroz + 1 filé médio") ajustada à meta de calorias dela. A soma das refeições do dia deve ficar perto da meta de cada um, deixando ~20% para lanches não planejados.
- "ingredientes": quantidades para a família toda. Em "item" ponha o número (#) do item da despensa usado; 0 se precisa comprar.
- "compras_sugeridas": junte tudo o que falta comprar para cumprir o cardápio.
- "descricao": 1 frase curta e apetitosa. "resumo": 2 frases sobre a semana (equilíbrio, o que foi aproveitado).
Não precisa escrever o modo de preparo agora.`;

  const pedido = `Planeje ${ctx.dias} dia(s) começando em ${ctx.inicio}.
Refeições de cada dia: ${ctx.refeicoes.join(", ")}.
Tempo máximo de preparo: ${ctx.tempo_max} min em dias de semana, ${ctx.tempo_max_fds} min no fim de semana.
Equipamentos disponíveis: ${ctx.equipamentos.join(", ")}.

PESSOAS:
${pessoas || "- (sem perfis cadastrados: considere 2 adultos, 2000 kcal cada)"}

DESPENSA:
${listaItens || "(vazia)"}
${ctx.favoritas?.length ? `\nPratos favoritos da família: ${ctx.favoritas.join(", ")}.` : ""}
${ctx.recentes?.length ? `\nEvite repetir pratos das últimas semanas: ${ctx.recentes.join(", ")}.` : ""}
${ctx.pedido_extra ? `\nPedido especial: ${ctx.pedido_extra}` : ""}`;

  const r = await perguntar({ system, conteudo: [{ type: "text", text: pedido }], schema: SCHEMA_CARDAPIO, esforco: "low", maxTokens: 32000 });
  // troca o número (#) pelo id real do item da despensa
  for (const d of r.dias) for (const ref of d.refeicoes) for (const ing of ref.ingredientes) {
    ing.item_id = ing.item > 0 ? ctx.itens[ing.item - 1]?.id ?? null : null;
    delete ing.item;
  }
  return r;
}

async function acaoReceita(b: any) {
  const r = b.receita;
  const texto = `Escreva o modo de preparo de "${r.nome}" (${r.descricao}).
Ingredientes: ${r.ingredientes.map((i: any) => `${i.quantidade} ${i.unidade} ${i.nome}`).join("; ")}.
Equipamentos: ${r.equipamentos.join(", ")}. Tempo total desejado: até ${r.tempo_min} min.
Passos curtos e numerados na ordem (máx. 8), em português simples. "dica": 1 dica útil (aproveitamento, substituição ou conservação).`;
  return perguntar({ system: "Você é um cozinheiro brasileiro que explica receitas de forma simples.", conteudo: [{ type: "text", text: texto }], schema: SCHEMA_RECEITA, esforco: "low", maxTokens: 4000 });
}

// nomes já cadastrados: a IA usa o mesmo nome quando for o mesmo produto, para o app somar em vez de duplicar
function blocoNomes(nomes: unknown) {
  const lista = Array.isArray(nomes) ? nomes.slice(0, 400).map(String) : [];
  return lista.length
    ? `\n\nItens que já existem na despensa. Se um produto lido for o mesmo, use EXATAMENTE este nome:\n${lista.join("; ")}`
    : "";
}

async function acaoLerImagem(b: any) {
  return perguntar({
    system: SYSTEM_LEITOR,
    conteudo: [
      { type: "image", source: { type: "base64", media_type: b.media_type ?? "image/jpeg", data: b.imagem } },
      { type: "text", text: "Liste os itens desta nota/lista de compras." + blocoNomes(b.nomes_existentes) },
    ],
    schema: SCHEMA_ITENS, esforco: "low", maxTokens: 8000,
  });
}

async function acaoLerTexto(texto: string, origem: string, nomes?: unknown) {
  return perguntar({
    system: SYSTEM_LEITOR,
    conteudo: [{ type: "text", text: `${origem}:\n\n${texto}${blocoNomes(nomes)}` }],
    schema: SCHEMA_ITENS, esforco: "low", maxTokens: 8000,
  });
}

async function acaoLerNfce(url: string, nomes?: unknown) {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("O QR Code não tem um link válido."); }
  // só consulta sites de Sefaz/Fazenda (impede uso do robô para abrir sites quaisquer)
  if (!/^https?:$/.test(u.protocol) || !/(\.gov\.br|fazenda|sefaz)/i.test(u.hostname)) {
    throw new Error("Esse QR Code não é de uma NFC-e (link não é da Sefaz).");
  }
  const resp = await fetch(u, {
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36" },
  });
  if (!resp.ok) throw new Error(`O site da Sefaz respondeu com erro ${resp.status}. Tente pela foto da nota.`);
  const html = await resp.text();
  const texto = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(tr|p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, 60000);
  if (texto.length < 200) throw new Error("A Sefaz não mostrou os itens da nota. Tente pela foto da nota.");
  return acaoLerTexto(texto, "Texto da página de consulta da NFC-e na Sefaz", nomes);
}

// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // só usuários logados no app podem usar a IA
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ erro: "Faça login novamente." }, 401);

    const b = await req.json();
    switch (b.acao) {
      case "cardapio":   return json(await acaoCardapio(b));
      case "receita":    return json(await acaoReceita(b));
      case "ler_imagem": return json(await acaoLerImagem(b));
      case "ler_texto":  return json(await acaoLerTexto(String(b.texto ?? "").slice(0, 20000), "Lista de compras digitada", b.nomes_existentes));
      case "ler_nfce":   return json(await acaoLerNfce(String(b.url ?? ""), b.nomes_existentes));
      default:           return json({ erro: "Ação desconhecida" }, 400);
    }
  } catch (e) {
    console.error(e);
    let msg = e instanceof Error ? e.message : String(e);
    if (e instanceof Anthropic.AuthenticationError) msg = "Chave da IA inválida. Confira o segredo ANTHROPIC_API_KEY no Supabase.";
    else if (e instanceof Anthropic.RateLimitError) msg = "Muitos pedidos seguidos à IA. Espere um minuto e tente de novo.";
    else if (e instanceof Anthropic.APIError) msg = `Erro na IA (${e.status}). Tente novamente.`;
    return json({ erro: msg }, 500);
  }
});
