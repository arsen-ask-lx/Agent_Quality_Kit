# Тест с глубокой вложенностью — не сложная логика, а разбор дерева ожиданий. Найдено замером
# по fastapi: 101 находка из 303 пришлась на tests/, и все они — таблицы ожидаемых ответов,
# которые никто не станет «упрощать». Гейт, который краснеет в основном на тестах, выключат.
def test_openapi_schema(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    for path, methods in schema["paths"].items():
        for method, spec in methods.items():
            for code, resp in spec["responses"].items():
                if "content" in resp:
                    for media, body in resp["content"].items():
                        if "schema" in body:
                            assert body["schema"] is not None
