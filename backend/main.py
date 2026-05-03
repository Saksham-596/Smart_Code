from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def home():
    return {"message": "Smart_Code Backend is Online"}
