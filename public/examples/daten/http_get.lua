local body = http_get(
	"https://api.open-meteo.com/v1/forecast?latitude=52.2799&longitude=8.0472&current=temperature_2m&timezone=Europe%2FBerlin"
)
print(body)
