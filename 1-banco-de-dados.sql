-- =====================================================================
--  DESPENSA ONLINE — Banco de dados (Supabase)
--  Como usar: Supabase → SQL Editor → New query → colar TUDO → Run.
--  Pode rodar de novo sem problema (não apaga nada).
-- =====================================================================

-- ---------- CASA (a família que divide a mesma despensa) ----------
create table if not exists casas (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  codigo_convite  text not null unique default upper(substr(md5(random()::text), 1, 6)),
  equipamentos    text[] not null default array['fogão','forno','micro-ondas','geladeira'],
  preferencias    jsonb not null default '{}'::jsonb,   -- refeições do dia, tempo máx, orçamento, etc.
  criado_em       timestamptz not null default now()
);

-- ---------- MEMBROS (logins que acessam a casa) ----------
create table if not exists membros (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  casa_id   uuid not null references casas(id) on delete cascade,
  nome      text,
  criado_em timestamptz not null default now()
);

-- ---------- PESSOAS (perfis de quem come — podem ter ou não login) ----------
create table if not exists pessoas (
  id               uuid primary key default gen_random_uuid(),
  casa_id          uuid not null references casas(id) on delete cascade,
  nome             text not null,
  sexo             text check (sexo in ('F','M')),
  nascimento       date,
  peso_kg          numeric(5,1),
  altura_cm        numeric(5,1),
  atividade        text not null default 'leve',      -- sedentario | leve | moderado | intenso
  objetivo         text not null default 'manter',    -- perder | manter | ganhar
  meta_kcal        integer,                           -- se preenchido, substitui o cálculo automático
  gosta            text,
  nao_gosta        text,
  restricoes       text,                              -- alergias, intolerâncias, dieta
  cor              text default '#16a34a',
  criado_em        timestamptz not null default now()
);

-- ---------- ITENS DA DESPENSA ----------
create table if not exists itens (
  id             uuid primary key default gen_random_uuid(),
  casa_id        uuid not null references casas(id) on delete cascade,
  nome           text not null,
  categoria      text not null default 'Outros',
  quantidade     numeric(10,2) not null default 1,
  unidade        text not null default 'un',
  local          text not null default 'despensa',    -- despensa | geladeira | freezer
  validade       date,
  minimo         numeric(10,2) default 0,             -- abaixo disso entra na lista de compras
  atualizado_em  timestamptz not null default now()
);
create index if not exists itens_casa_idx on itens(casa_id);

-- ---------- CARDÁPIOS GERADOS ----------
create table if not exists cardapios (
  id            uuid primary key default gen_random_uuid(),
  casa_id       uuid not null references casas(id) on delete cascade,
  semana_inicio date not null,
  dados         jsonb not null,
  criado_em     timestamptz not null default now()
);
create index if not exists cardapios_casa_idx on cardapios(casa_id, criado_em desc);

-- ---------- LISTA DE COMPRAS ----------
create table if not exists compras (
  id          uuid primary key default gen_random_uuid(),
  casa_id     uuid not null references casas(id) on delete cascade,
  nome        text not null,
  quantidade  numeric(10,2),
  unidade     text,
  origem      text default 'manual',                  -- manual | estoque_baixo | cardapio
  comprado    boolean not null default false,
  criado_em   timestamptz not null default now()
);

-- ---------- RECEITAS FAVORITAS ----------
create table if not exists favoritas (
  id         uuid primary key default gen_random_uuid(),
  casa_id    uuid not null references casas(id) on delete cascade,
  nome       text not null,
  dados      jsonb not null,
  nota       integer check (nota between 1 and 5),
  criado_em  timestamptz not null default now()
);

-- =====================================================================
--  SEGURANÇA: cada família só enxerga os dados da própria casa
-- =====================================================================
create or replace function minha_casa() returns uuid
language sql stable security definer set search_path = public as $$
  select casa_id from membros where user_id = auth.uid()
$$;

alter table casas     enable row level security;
alter table membros   enable row level security;
alter table pessoas   enable row level security;
alter table itens     enable row level security;
alter table cardapios enable row level security;
alter table compras   enable row level security;
alter table favoritas enable row level security;

drop policy if exists casa_ver    on casas;
drop policy if exists casa_editar on casas;
create policy casa_ver    on casas for select to authenticated using (id = minha_casa());
create policy casa_editar on casas for update to authenticated using (id = minha_casa());

drop policy if exists membros_ver on membros;
create policy membros_ver on membros for select to authenticated using (casa_id = minha_casa());

do $$
declare t text;
begin
  foreach t in array array['pessoas','itens','cardapios','compras','favoritas'] loop
    execute format('drop policy if exists %1$s_casa on %1$s', t);
    execute format(
      'create policy %1$s_casa on %1$s for all to authenticated
         using (casa_id = minha_casa()) with check (casa_id = minha_casa())', t);
  end loop;
end $$;

-- =====================================================================
--  FUNÇÕES chamadas pelo app: criar casa / entrar com código
-- =====================================================================
create or replace function criar_casa(p_nome_casa text, p_meu_nome text)
returns casas language plpgsql security definer set search_path = public as $$
declare c casas;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  if exists (select 1 from membros where user_id = auth.uid()) then
    raise exception 'Você já participa de uma casa';
  end if;
  insert into casas(nome) values (p_nome_casa) returning * into c;
  insert into membros(user_id, casa_id, nome) values (auth.uid(), c.id, p_meu_nome);
  return c;
end $$;

create or replace function entrar_na_casa(p_codigo text, p_meu_nome text)
returns casas language plpgsql security definer set search_path = public as $$
declare c casas;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro'; end if;
  select * into c from casas where codigo_convite = upper(trim(p_codigo));
  if c.id is null then raise exception 'Código não encontrado'; end if;
  insert into membros(user_id, casa_id, nome) values (auth.uid(), c.id, p_meu_nome)
    on conflict (user_id) do update set casa_id = excluded.casa_id, nome = excluded.nome;
  return c;
end $$;

grant execute on function criar_casa(text, text)     to authenticated;
grant execute on function entrar_na_casa(text, text) to authenticated;
