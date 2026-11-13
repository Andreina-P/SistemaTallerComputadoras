# Modelo entidad-relación

Seis tablas en PostgreSQL. Los nombres de tablas y columnas están en inglés y en snake_case.
Este diagrama debe mantenerse igual que las migraciones de `base-de-datos/migraciones/`.

```mermaid
erDiagram
    users ||--o| customers : "tiene perfil"
    users ||--o{ recovery_tokens : "solicita"
    users ||--o{ orders : "es técnico de"
    users ||--o{ status_history : "registra"
    users ||--o{ messages : "envía"
    customers ||--o{ orders : "tiene"
    orders ||--o{ status_history : "acumula"
    orders ||--o{ messages : "tiene chat"

    users {
        int id PK
        string name
        string email UK
        string password_hash
        enum role "admin, technician, customer"
        boolean active
        datetime created_at
    }

    customers {
        int id PK
        int user_id FK, UK
        string national_id UK
        string phone
        string address
    }

    orders {
        int id PK
        string order_number UK
        int customer_id FK
        int technician_id FK
        enum device_type
        string brand
        string model
        string serial_number
        string reported_issue
        date received_at
        enum status
        decimal estimated_cost
        datetime created_at
        datetime updated_at
    }

    status_history {
        int id PK
        int order_id FK
        enum previous_status
        enum new_status
        string comment
        boolean customer_visible
        int user_id FK
        datetime created_at
    }

    messages {
        int id PK
        int order_id FK "nulo = sala general"
        int user_id FK
        string text
        datetime created_at
    }

    recovery_tokens {
        int id PK
        int user_id FK
        string token_hash UK
        datetime expires_at
        datetime used_at
    }
```

## Valores de los enum

| Columna                                                                        | Valores                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `users.role`                                                                   | `admin`, `technician`, `customer`                                        |
| `orders.device_type`                                                           | `laptop`, `desktop`, `all_in_one`, `other`                               |
| `orders.status`, `status_history.previous_status`, `status_history.new_status` | `received`, `diagnosing`, `repairing`, `ready`, `delivered`, `cancelled` |

## Índices

| Tabla             | Índice                          | Para qué               |
| ----------------- | ------------------------------- | ---------------------- |
| `users`           | `email` (único)                 | Inicio de sesión       |
| `customers`       | `national_id` (único)           | Búsqueda de cliente    |
| `orders`          | `order_number` (único)          | Búsqueda por número    |
| `orders`          | `status`                        | Filtro del listado     |
| `orders`          | `customer_id`, `technician_id`  | Listado por rol        |
| `status_history`  | `order_id`, `created_at`        | Historial de una orden |
| `messages`        | `order_id`, `created_at`        | Historial del chat     |
| `recovery_tokens` | `token_hash` (único), `user_id` | Validar el token       |

## Restricciones

- `orders.estimated_cost` debe ser mayor o igual a 0.
- Eliminar una orden elimina su historial y sus mensajes (`ON DELETE CASCADE`).
- No se puede eliminar un cliente que tiene órdenes (`ON DELETE RESTRICT`).
