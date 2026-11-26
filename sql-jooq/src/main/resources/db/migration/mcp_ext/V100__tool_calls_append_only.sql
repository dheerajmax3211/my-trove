-- Not read by the jOOQ generator (plpgsql / triggers). Same pattern as platform_ext/V103 for platform.flag_audit.
create function mcp.tool_calls_block_mutation() returns trigger
    language plpgsql
as $$
begin
    raise exception 'mcp.tool_calls is append-only: % is not allowed', tg_op
        using errcode = 'integrity_constraint_violation';
end;
$$;

create trigger tool_calls_no_update_delete
    before update or delete on mcp.tool_calls
    for each row execute function mcp.tool_calls_block_mutation();

create trigger tool_calls_no_truncate
    before truncate on mcp.tool_calls
    for each statement execute function mcp.tool_calls_block_mutation();
