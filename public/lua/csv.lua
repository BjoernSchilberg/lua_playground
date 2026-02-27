----------------------------------------------------------------------
-- csv.lua – robust CSV parser for the Lua Playground
--
-- Features:
--   • configurable separator ("," or ";" etc.)
--   • RFC 4180 quoted fields  ("" as escape for literal ")
--   • CRLF and LF line endings
--   • optional UTF-8 BOM at start
--   • empty fields are preserved  (a;;c → {"a","","c"})
--
-- Usage:
--   local csv = require("csv")
--   local rows = csv.parse(text)               -- sep = ","
--   local rows = csv.parse(text, { sep = ";" })
--
--   -- iterate lazily
--   for row in csv.rows(text, { sep = ";" }) do ... end
--
--   -- header mode: returns list of {header=value, …} tables
--   local records = csv.parse(text, { header = true })
----------------------------------------------------------------------

local csv = {}
csv._VERSION = "csv 1.0"

--- Strip a leading UTF-8 BOM (EF BB BF) if present.
local function strip_bom(s)
  if s:sub(1, 3) == "\xEF\xBB\xBF" then
    return s:sub(4)
  end
  return s
end

----------------------------------------------------------------------
-- Low-level field parser.
-- Returns  field_value, next_position
-- `pos` must point to the first character of the field (or separator/EOL).
----------------------------------------------------------------------
local function parse_field(s, pos, sep)
  if pos > #s then
    return "", pos
  end

  local c = s:sub(pos, pos)

  -- Quoted field
  if c == '"' then
    local buf = {}
    local i = pos + 1
    while i <= #s do
      local j = s:find('"', i, true)
      if not j then
        -- unterminated quote – take rest of string
        buf[#buf + 1] = s:sub(i)
        return table.concat(buf), #s + 1
      end
      buf[#buf + 1] = s:sub(i, j - 1)
      -- check for escaped quote ""
      if s:sub(j + 1, j + 1) == '"' then
        buf[#buf + 1] = '"'
        i = j + 2
      else
        -- end of quoted field – advance past closing quote
        local after = j + 1
        -- skip to separator or EOL
        if s:sub(after, after) == sep then
          return table.concat(buf), after + 1
        elseif s:sub(after, after + 1) == "\r\n" then
          return table.concat(buf), after
        elseif s:sub(after, after) == "\n" or s:sub(after, after) == "\r" then
          return table.concat(buf), after
        else
          -- garbage after closing quote – be lenient, advance
          return table.concat(buf), after
        end
      end
    end
    return table.concat(buf), #s + 1
  end

  -- Unquoted field: read until separator or EOL
  local sep_pos = s:find(sep, pos, true)
  local nl_pos  = s:find("[\r\n]", pos)

  local field_end
  if sep_pos and (not nl_pos or sep_pos < nl_pos) then
    field_end = sep_pos
  elseif nl_pos then
    field_end = nl_pos
  else
    -- last field, no trailing newline
    return s:sub(pos), #s + 1
  end

  if field_end == sep_pos then
    return s:sub(pos, field_end - 1), field_end + 1
  else
    return s:sub(pos, field_end - 1), field_end
  end
end

----------------------------------------------------------------------
-- Parse one line starting at `pos`.
-- Returns  row_table, next_position  (next_position past the newline)
----------------------------------------------------------------------
local function parse_row(s, pos, sep)
  local row = {}
  while pos <= #s do
    local field, nxt = parse_field(s, pos, sep)
    row[#row + 1] = field

    if nxt > #s then
      pos = nxt
      break
    end

    local ch = s:sub(nxt, nxt)
    -- If next char is separator we already consumed it in parse_field
    -- when the field ended at sep → nxt points past sep.
    -- But if the field ended at EOL we need to consume the EOL.
    if ch == "\r" then
      pos = (s:sub(nxt + 1, nxt + 1) == "\n") and nxt + 2 or nxt + 1
      break
    elseif ch == "\n" then
      pos = nxt + 1
      break
    else
      -- nxt already points to next field (past separator)
      pos = nxt
    end
  end
  return row, pos
end

----------------------------------------------------------------------
-- csv.rows(text [, opts])  – iterator
----------------------------------------------------------------------
function csv.rows(text, opts)
  opts = opts or {}
  local sep = opts.sep or ","
  local s   = strip_bom(text)
  local pos = 1
  return function()
    if pos > #s then return nil end
    local row, nxt = parse_row(s, pos, sep)
    pos = nxt
    return row
  end
end

----------------------------------------------------------------------
-- csv.parse(text [, opts])  – returns all rows as a table
--
-- opts.sep     separator character  (default ",")
-- opts.header  if true, first row becomes keys; returns list of tables
----------------------------------------------------------------------
function csv.parse(text, opts)
  opts = opts or {}
  local sep    = opts.sep or ","
  local header = opts.header
  local s      = strip_bom(text)
  local pos    = 1
  local rows   = {}

  -- Parse first row (potential header)
  if pos > #s then return rows end
  local first, nxt = parse_row(s, pos, sep)
  pos = nxt

  if not header then
    rows[#rows + 1] = first
  end

  while pos <= #s do
    local row
    row, pos = parse_row(s, pos, sep)
    if header then
      local record = {}
      for i, key in ipairs(first) do
        record[key] = row[i] or ""
      end
      rows[#rows + 1] = record
    else
      rows[#rows + 1] = row
    end
  end

  return rows
end

return csv
