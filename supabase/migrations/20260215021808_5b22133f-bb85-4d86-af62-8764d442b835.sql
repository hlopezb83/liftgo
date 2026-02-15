CREATE UNIQUE INDEX forklifts_name_unique ON forklifts (name);
CREATE UNIQUE INDEX forklifts_serial_number_unique ON forklifts (serial_number) WHERE serial_number IS NOT NULL;