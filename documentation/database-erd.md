# DineEasy Database Entity Relationship Diagram (ERD)

## Core Relationships
- `categories` 1 : N `menu_items`
- `menu_items` 1 : N `menu_item_translations`
- `menu_items` 1 : N `menu_item_options` 1 : N `menu_item_option_values`
- `tables` 1 : N `table_sessions`
- `table_sessions` 1 : N `orders`
- `table_sessions` 1 : N `payments` 1 : 1 `receipts`
- `orders` 1 : N `order_items` 1 : N `order_item_options`
- `users` 1 : N `orders` (confirming/serving staff) & 1 : N `payments` (verifying staff)
- `languages` 1 : N `ui_translations`
- `expense_categories` 1 : N `expenses`

```mermaid
erDiagram
    USERS ||--o{ ORDERS : manages
    USERS ||--o{ PAYMENTS : verifies
    USERS ||--o{ AUDIT_LOGS : triggers
    TABLES ||--o{ TABLE_SESSIONS : opens
    TABLE_SESSIONS ||--o{ ORDERS : contains
    TABLE_SESSIONS ||--o{ PAYMENTS : settles
    PAYMENTS ||--|| RECEIPTS : generates
    CATEGORIES ||--o{ MENU_ITEMS : groups
    CATEGORIES ||--o{ CATEGORY_TRANSLATIONS : translates
    MENU_ITEMS ||--o{ MENU_ITEM_TRANSLATIONS : translates
    MENU_ITEMS ||--o{ MENU_ITEM_OPTIONS : customizes
    MENU_ITEM_OPTIONS ||--o{ MENU_ITEM_OPTION_VALUES : defines
    ORDERS ||--o{ ORDER_ITEMS : includes
    MENU_ITEMS ||--o{ ORDER_ITEMS : referenced_by
    ORDER_ITEMS ||--o{ ORDER_ITEM_OPTIONS : records
    LANGUAGES ||--o{ UI_TRANSLATIONS : localizes
    EXPENSE_CATEGORIES ||--o{ EXPENSES : categorizes
```

See `/database/schema.sql` for the complete MySQL 8 / MariaDB DDL and `/server/db.ts` for the live SQLite schema.
