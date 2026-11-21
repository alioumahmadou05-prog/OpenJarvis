"""NxxR JARVIS: a personal-assistant layer on top of OpenJarvis.

It adds what a daily assistant needs and OpenJarvis does not ship by itself:
conversation history, an editable long-term memory, reminders, website
monitoring, background jobs, notifications and an audit log, plus the JARVIS
persona. Models, connectors (Gmail, Calendar), web search and speech come from
OpenJarvis itself.
"""

from openjarvis.nxxr.store import NxxrStore

__all__ = ["NxxrStore"]
