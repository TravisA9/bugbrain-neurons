<?php
if(!function_exists('str_starts_with')){function str_starts_with(string $h,string $n):bool{return $n===''||strncmp($h,$n,strlen($n))===0;}}
if(!function_exists('str_ends_with')){function str_ends_with(string $h,string $n):bool{return $n===''||substr($h,-strlen($n))===$n;}}
