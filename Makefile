NODE ?= node

.PHONY: all setup doctor match replay clean
all:
	$(NODE) clunkyard.cjs build
setup:
	$(NODE) clunkyard.cjs setup
doctor:
	$(NODE) clunkyard.cjs doctor
match:
	$(NODE) clunkyard.cjs match
replay:
	$(NODE) clunkyard.cjs replay
clean:
	$(NODE) clunkyard.cjs clean
