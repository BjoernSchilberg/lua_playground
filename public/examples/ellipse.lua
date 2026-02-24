function Hello(...)
	local data = { ... }
	for k, v in pairs(data) do
		print("Hello", v)
	end
end

Hello("John", "Otto", "Mary", "Joseph")
