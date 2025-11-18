#!/usr/bin/env python3
"""
Test if correctDirection() resets width
"""
import fontforge

# Create a test font
font = fontforge.font()
font.fontname = "TestFont"

# Create base character
base = font.createChar(ord('X'), 'X')
pen = base.glyphPen()
pen.moveTo((0, 0))
pen.lineTo((200, 0))
pen.lineTo((200, 600))
pen.lineTo((0, 600))
pen.closePath()
pen = None
base.width = 300

# Create accidental
acc = font.createChar(ord('#'), 'hash')
pen = acc.glyphPen()
pen.moveTo((0, 0))
pen.lineTo((100, 0))
pen.lineTo((100, 400))
pen.lineTo((0, 400))
pen.closePath()
pen = None
acc.width = 150

# Create composite
comp = font.createChar(0xE000, 'X_sharp')
comp.clear()
comp.addReference('X')
comp.addReference('hash', (1, 0, 0, 1, 200, 0))

print(f"Before setting width:      {comp.width}")
comp.width = 350
print(f"After setting width:       {comp.width}")

comp.unlinkRef()
print(f"After unlinkRef():         {comp.width}")

comp.correctDirection()
print(f"After correctDirection():  {comp.width}")

font.close()
