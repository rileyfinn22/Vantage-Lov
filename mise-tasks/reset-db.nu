#!/usr/bin/env nu
#MISE description = "Reset the database by dropping all tables in the public schema, and resetting drizzle"
print "Are you sure you want to reset the database? This will delete all data and cannot be undone. Type 'yes' to confirm: "
let confirmation = input

if $confirmation != "yes" {
    print "Database reset cancelled."
    exit 0
}

def --wrapped PS [--ignore (-i), ...rest] {
    if $ignore {
        do -i { ^psql '-h' $env.PGHOST '-U' $env.PGUSER '-d' postgres '--no-password' ...$rest }
    } else {
        do { ^psql '-h' $env.PGHOST '-U' $env.PGUSER '-d' postgres '--no-password' ...$rest }
    }
    
}

PS -i -c $"DROP DATABASE IF EXISTS ($env.PGDB) WITH \(FORCE);"
PS -i -c $"CREATE DATABASE ($env.PGDB);"