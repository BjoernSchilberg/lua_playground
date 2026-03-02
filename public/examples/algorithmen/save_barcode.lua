-- EAN-8 / EAN-13 barcode generator (dependency-free)
-- Output: PPM (P3) image – wird als Download gespeichert
--
-- Ändere die EAN-Nummer oder die Größe nach Belieben:

local ean = "4002846034504"
local size = "small" -- "small" or "big"

local line_width = 2
local font_size = 23 -- kept for parity; no longer used for placement
local line_height = 100
local margin = 40

-- Encoding tables (strings of 0/1)
local letter_code_before_middle_odd = {
	"0001101",
	"0011001",
	"0010011",
	"0111101",
	"0100011",
	"0110001",
	"0101111",
	"0111011",
	"0110111",
	"0001011",
}
local letter_code_before_middle_even = {
	"0100111",
	"0110011",
	"0011011",
	"0100001",
	"0011101",
	"0111001",
	"0000101",
	"0010001",
	"0001001",
	"0010111",
}
local letter_code_after_middle = {
	"1110010",
	"1100110",
	"1101100",
	"1000010",
	"1011100",
	"1001110",
	"1010000",
	"1000100",
	"1001000",
	"1110100",
}
local even_odd = {
	"uuuuuu",
	"uugugg",
	"uuggug",
	"uugggu",
	"uguugg",
	"ugguug",
	"uggguu",
	"ugugug",
	"uguggu",
	"uggugu",
}

local function is_digits_only(s)
	return s:match("^%d+$") ~= nil
end

local function set_size(sz)
	if sz == "small" then
		font_size = 23
		line_width = 2
	elseif sz == "big" then
		line_width = 4
		font_size = 34
	end
end

-- Create an array filled with 0 (1-based indexing)
local function zeros(n)
	local t = {}
	for i = 1, n do
		t[i] = 0
	end
	return t
end

local barcode_values_13 = zeros(95)
local barcode_values_8 = zeros(67)

local function ean_thirteen(barcode_plain)
	for plain = 1, 12 do
		for num = 0, 6 do
			if plain < 7 then
				local order = even_odd[tonumber(barcode_plain:sub(1, 1)) + 1]
				local parity = order:sub(plain, plain)
				local digit = tonumber(barcode_plain:sub(plain + 1, plain + 1))
				local bits = (parity == "u") and letter_code_before_middle_odd[digit + 1]
					or letter_code_before_middle_even[digit + 1]
				local bit = tonumber(bits:sub(num + 1, num + 1))
				local idx = ((plain - 1) * 7 + 3 + num) + 1
				barcode_values_13[idx] = bit
			else
				local digit = tonumber(barcode_plain:sub(plain + 1, plain + 1))
				local bits = letter_code_after_middle[digit + 1]
				local bit = tonumber(bits:sub(num + 1, num + 1))
				local idx = (plain * 7 + 1 + num) + 1
				barcode_values_13[idx] = bit
			end
		end
	end
end

local function ean_eight(barcode_plain)
	for plain = 0, 7 do
		for num = 0, 6 do
			local digit = tonumber(barcode_plain:sub(plain + 1, plain + 1))
			if plain < 4 then
				local bits = letter_code_before_middle_odd[digit + 1]
				local bit = tonumber(bits:sub(num + 1, num + 1))
				local idx = (plain * 7 + 3 + num) + 1
				barcode_values_8[idx] = bit
			else
				local bits = letter_code_after_middle[digit + 1]
				local bit = tonumber(bits:sub(num + 1, num + 1))
				local idx = (plain * 7 + 8 + num) + 1
				barcode_values_8[idx] = bit
			end
		end
	end
end

-- =========================
-- Minimal drawing to PPM
-- =========================

local function new_image(w, h)
	local pixels = {}
	for y = 1, h do
		pixels[y] = {}
		for x = 1, w do
			pixels[y][x] = { 255, 255, 255 }
		end
	end
	return pixels
end

local function fill_rect(pixels, x0, y0, x1, y1, r, g, b)
	local h = #pixels
	local w = #pixels[1]
	if x0 < 1 then
		x0 = 1
	end
	if y0 < 1 then
		y0 = 1
	end
	if x1 > w then
		x1 = w
	end
	if y1 > h then
		y1 = h
	end
	for y = y0, y1 do
		for x = x0, x1 do
			local p = pixels[y][x]
			p[1], p[2], p[3] = r, g, b
		end
	end
end

local function write_ppm(path, pixels)
	local h = #pixels
	local w = #pixels[1]
	local f = assert(io.open(path, "w"))
	f:write(("P3\n%d %d\n255\n"):format(w, h))
	for y = 1, h do
		for x = 1, w do
			local p = pixels[y][x]
			f:write(("%d %d %d "):format(p[1], p[2], p[3]))
		end
		f:write("\n")
	end
	f:close()
end

-- =========================
-- 7-seg digits (dependency-free)
-- with stable metrics + CENTERED placement
-- =========================

local segmap = {
	["0"] = { a = 1, b = 1, c = 1, d = 1, e = 1, f = 1, g = 0 },
	["1"] = { a = 0, b = 1, c = 1, d = 0, e = 0, f = 0, g = 0 },
	["2"] = { a = 1, b = 1, c = 0, d = 1, e = 1, f = 0, g = 1 },
	["3"] = { a = 1, b = 1, c = 1, d = 1, e = 0, f = 0, g = 1 },
	["4"] = { a = 0, b = 1, c = 1, d = 0, e = 0, f = 1, g = 1 },
	["5"] = { a = 1, b = 0, c = 1, d = 1, e = 0, f = 1, g = 1 },
	["6"] = { a = 1, b = 0, c = 1, d = 1, e = 1, f = 1, g = 1 },
	["7"] = { a = 1, b = 1, c = 1, d = 0, e = 0, f = 0, g = 0 },
	["8"] = { a = 1, b = 1, c = 1, d = 1, e = 1, f = 1, g = 1 },
	["9"] = { a = 1, b = 1, c = 1, d = 1, e = 0, f = 1, g = 1 },
}

local function digit_metrics(scale)
	-- keep everything integer & predictable
	local s = math.max(1, math.floor(scale))
	local t = s -- thickness
	local w = 6 * s + 2 * t + 1
	local h = 10 * s + 3 * t + 1
	local spacing = 2 * s + 2
	return w, h, t, spacing
end

local function draw_digit_7seg(pixels, x, y, scale, ch)
	local m = segmap[ch]
	if not m then
		return
	end
	local w, h, t = digit_metrics(scale)

	local function seg_a()
		fill_rect(pixels, x + t, y, x + w - t, y + t, 0, 0, 0)
	end
	local function seg_d()
		fill_rect(pixels, x + t, y + h - t, x + w - t, y + h, 0, 0, 0)
	end
	local function seg_g()
		fill_rect(pixels, x + t, y + (h // 2), x + w - t, y + (h // 2) + t, 0, 0, 0)
	end
	local function seg_f()
		fill_rect(pixels, x, y + t, x + t, y + (h // 2), 0, 0, 0)
	end
	local function seg_e()
		fill_rect(pixels, x, y + (h // 2), x + t, y + h - t, 0, 0, 0)
	end
	local function seg_b()
		fill_rect(pixels, x + w - t, y + t, x + w, y + (h // 2), 0, 0, 0)
	end
	local function seg_c()
		fill_rect(pixels, x + w - t, y + (h // 2), x + w, y + h - t, 0, 0, 0)
	end

	if m.a == 1 then
		seg_a()
	end
	if m.b == 1 then
		seg_b()
	end
	if m.c == 1 then
		seg_c()
	end
	if m.d == 1 then
		seg_d()
	end
	if m.e == 1 then
		seg_e()
	end
	if m.f == 1 then
		seg_f()
	end
	if m.g == 1 then
		seg_g()
	end
end

local function draw_digits_centered(pixels, center_x, y, scale, s)
	local w, _, _, spacing = digit_metrics(scale)
	local n = #s
	local group_w = n * w + (n - 1) * spacing
	local x0 = math.floor(center_x - group_w / 2)

	local x = x0
	for i = 1, n do
		local ch = s:sub(i, i)
		draw_digit_7seg(pixels, x, y, scale, ch)
		x = x + w + spacing
	end
end

local function draw_digits_left(pixels, x0, y, scale, s)
	local w, _, _, spacing = digit_metrics(scale)
	local x = x0
	for i = 1, #s do
		draw_digit_7seg(pixels, x, y, scale, s:sub(i, i))
		x = x + w + spacing
	end
end

-- =========================
-- Rendering barcodes
-- =========================

local function render_and_save(plain, out_path)
	if not is_digits_only(plain) then
		io.stderr:write("Error: Only numbers allowed!\n")
		return
	end
	if #plain ~= 8 and #plain ~= 13 then
		io.stderr:write("Error: Please enter valid EAN (8 or 13 digits)!\n")
		return
	end

	barcode_values_13 = zeros(95)
	barcode_values_8 = zeros(67)

	if #plain == 8 then
		ean_eight(plain)
	else
		ean_thirteen(plain)
	end

	set_size(size)

	local width = line_width
	local height = line_height
	local off = margin

	local image_width = width * 102 + off
	local image_height = height + 40

	local pixels = new_image(image_width, image_height)

	local function draw_module(x_left, is_black, y_top, y_bottom)
		if is_black then
			fill_rect(pixels, x_left, y_top, x_left + width - 1, y_bottom, 0, 0, 0)
		end
	end

	if #plain == 8 then
		local guards = { [0] = true, [2] = true, [32] = true, [34] = true, [64] = true, [66] = true }
		local left = math.floor((image_width - 67 * width) / 2)

		for i = 0, 66 do
			local x = left + i * width + 1
			local bit = barcode_values_8[i + 1] == 1
			draw_module(x, bit, 10, height)
			if guards[i] then
				draw_module(x, true, 10, height + 15)
			end
		end

		-- TEXT: center groups at anchor point
		local scale = (size == "big") and 2 or 1
		local y_text = height + 6
		local c1 = left + width * 17
		local c2 = left + width * 49
		draw_digits_centered(pixels, c1, y_text, scale, plain:sub(1, 4))
		draw_digits_centered(pixels, c2, y_text, scale, plain:sub(5, 8))
	else
		local guards = { [0] = true, [2] = true, [46] = true, [48] = true, [92] = true, [94] = true }

		for i = 0, 94 do
			local x = off + i * width + 1
			local bit = barcode_values_13[i + 1] == 1
			draw_module(x, bit, 10, height)
			if guards[i] then
				draw_module(x, true, 10, height + 15)
			end
		end

		-- TEXT: mimic anchors, but with real pixel-centering for our 7-seg font
		local scale = (size == "big") and 2 or 1
		local y_text = height + 6

		-- first digit at (off-25, height)
		-- -> for our font: place by centers at off+width*24 and off+width*70,
		--    and left-most digit with a left anchor at off-25.
		local x_first_left = off - 25 + 1
		local c_left = off + width * 24
		local c_right = off + width * 70

		draw_digits_left(pixels, x_first_left, y_text, scale, plain:sub(1, 1))
		draw_digits_centered(pixels, c_left, y_text, scale, plain:sub(2, 7))
		draw_digits_centered(pixels, c_right, y_text, scale, plain:sub(8, 13))
	end

	write_ppm(out_path, pixels)
	print("Wrote " .. out_path)
end

-- Barcode erzeugen und als Download speichern
render_and_save(ean, ean .. ".ppm")

