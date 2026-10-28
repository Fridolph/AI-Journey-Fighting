## 索引的作用

- 加速条件检索
- 加速排序、加速关联
- 功能性索引：排他性、唯一性

## 索引扫描的方式

### Index Scan

索引扫描是指数据库系统在查询数据时，先访问已建立的索引（类似于书的目录），通过遍历索引结构来快速定位并检索出符合条件的数据行，而不是对整张表进行逐行扫描

### Index Only Scan

Index Only Scan（仅索引扫描）是数据库（常见于 PostgreSQL 或 GaussDB 等关系型数据库）中的一种查询优化技术。

在执行 SQL 查询时，传统做法通常需要先通过索引找到数据所在的行，然后再去访问表的数据堆（Heap / Data Block）来提取具体的列值（即俗称的“回表”）。
如果查询所需要的所有字段（包括 SELECT 后面查询的字段以及 WHERE、ORDER BY、GROUP BY 中的条件字段）全部都包含在同一个索引中，数据库就可以直接从索引结构中拿到结果，完全不需要去访问底层的表数据行。

其优点：

• 减少 I/O 操作：省去了访问表数据堆（Heap）的步骤，大幅降低磁盘或内存随机读写开销。
• 查询提速：由于只扫描较小的索引文件，检索效率比普通的 Index Scan 或全表扫描（Full Table Scan）更高。

### Bitmap Scan

位图扫描是数据库（如 PostgreSQL、GaussDB、KingbaseES）中介于 Index Scan（索引扫描）与 Seq Scan（全表扫描）之间的一种折中型数据访问方式。

- Index Scan 的痛点：传统的 Index Scan 每次从索引中拿到一条记录的指针（TID，即元组地址），就立刻去堆表（Heap）里随机读取数据。如果命中了成千上万行数据，就会产生大量的随机 I/O，性能急剧下降。
- Seq Scan 的痛点：如果改用全表扫描，虽然是顺序 I/O，但会把整张表的所有数据页都读一遍，开销可能过大。
- Bitmap Scan 的解法：它将随机查找转化为“先收集、再排序、后顺序访问”的过程。

1. 阶段 1：Bitmap Index Scan（位图索引扫描）
	• 遍历索引（如 B-tree、GIN 等），找出所有符合条件的元组指针（TID，包含数据块号 blockno 和偏移量 offset）。
	• 将这些 TID 记录到一个内存中的 TIDBitmap（位图结构）里。如果查询条件有多个索引，还可以进行 BitmapAnd（交集）或 BitmapOr（并集）的位图合并。
2. 阶段 2：Bitmap Heap Scan（位图堆表扫描）
	• 将 TIDBitmap 中的数据块号（blockno）按照物理顺序进行排序。
	• 按照排序后的顺序去访问堆表（Heap）。由于块号是有序的，随机 I/O 变成了高效的顺序 I/O，并且同一个数据页只需从磁盘或内存中读取一次。
	• 对读取出的数据进行 Recheck（重新检查过滤条件）以确保准确性。


## 索引的属性

- can_order 在创建索引时指定值的排序顺序（仅适用于 BETREE支持）
- can_unique 支持唯一约束和主键（仅适用于BTREE）
- can_multi_col：可以在多个列上创建索引
- clusterable 是否可能根据索引对数据行重新排序（仅针对于存量数据，是一次性的）
- index_scan 支持索引扫描。不是所有的索引都可以逐个返回TID，有些是一次性全部返回，并且只支持位图扫描
- bitmap_scan 支持位图扫描
- backward_scan 返回结果的顺序与创建索引时指定的顺序相反

## 列属性

- asc desc nulls_first nulls_last orderable 与值的排序有关
- distance_orderable 结果可以按照操作指定的顺序返回（目前仅适用于GiST 和 RUM 索引）
- search_array 支持在表达式里面搜索多个值
- search_nulls 可以通过 IS NULL 和 IS NOT NULL 条件进行搜索