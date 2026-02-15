eingabe = ""
i=0
while eingabe ~= "q" do
  i=i+1
  eingabe = io.read()
  print(eingabe,i)
end
 
print("Du hast das Programm mit 'q' beendet.")