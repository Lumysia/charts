# Entrypoint hook (sourced by /opt/cua/desktop/entrypoint.sh as root).
# A fresh bind mount over /home/cua is empty: copy in the desktop profile the
# image ships, without overwriting anything already there, and give it back to
# the desktop user.
cp -a --update=none /opt/dsh/home-skel/. /home/cua/
chown cua:cua /home/cua
