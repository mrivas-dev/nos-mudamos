-- Tope pedido por M: US$ 3.000 por mes sumando expensas
UPDATE settings
SET value = json_set(value, '$.maxPrice', 3000, '$.currency', 'USD')
WHERE key = 'criteria';
